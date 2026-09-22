use std::{
    io,
    process::{Child, ChildStderr, ChildStdin, ChildStdout, Command, ExitStatus},
};

#[cfg(not(windows))]
use crate::runtime_core::{configure_owned_process, terminate_owned_process};

#[cfg(windows)]
use std::{
    ffi::c_void,
    mem::{size_of, zeroed},
    os::windows::{
        io::{AsRawHandle, FromRawHandle, OwnedHandle, RawHandle},
        process::CommandExt,
    },
    ptr,
};

#[cfg(windows)]
const CREATE_SUSPENDED: u32 = 0x0000_0004;
#[cfg(windows)]
const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x0000_2000;
#[cfg(windows)]
const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS: i32 = 9;
#[cfg(windows)]
const TH32CS_SNAPTHREAD: u32 = 0x0000_0004;
#[cfg(windows)]
const THREAD_SUSPEND_RESUME: u32 = 0x0000_0002;

#[cfg(windows)]
#[repr(C)]
struct JobObjectBasicLimitInformation {
    per_process_user_time_limit: i64,
    per_job_user_time_limit: i64,
    limit_flags: u32,
    minimum_working_set_size: usize,
    maximum_working_set_size: usize,
    active_process_limit: u32,
    affinity: usize,
    priority_class: u32,
    scheduling_class: u32,
}

#[cfg(windows)]
#[repr(C)]
struct IoCounters {
    read_operation_count: u64,
    write_operation_count: u64,
    other_operation_count: u64,
    read_transfer_count: u64,
    write_transfer_count: u64,
    other_transfer_count: u64,
}

#[cfg(windows)]
#[repr(C)]
struct JobObjectExtendedLimitInformation {
    basic_limit_information: JobObjectBasicLimitInformation,
    io_info: IoCounters,
    process_memory_limit: usize,
    job_memory_limit: usize,
    peak_process_memory_used: usize,
    peak_job_memory_used: usize,
}

#[cfg(windows)]
#[repr(C)]
struct ThreadEntry32 {
    size: u32,
    usage_count: u32,
    thread_id: u32,
    owner_process_id: u32,
    base_priority: i32,
    delta_priority: i32,
    flags: u32,
}

#[cfg(windows)]
#[link(name = "kernel32")]
extern "system" {
    #[link_name = "CreateJobObjectW"]
    fn create_job_object(
        job_attributes: *const c_void,
        name: *const u16,
    ) -> RawHandle;
    #[link_name = "SetInformationJobObject"]
    fn set_information_job_object(
        job: RawHandle,
        information_class: i32,
        information: *const c_void,
        information_length: u32,
    ) -> i32;
    #[link_name = "AssignProcessToJobObject"]
    fn assign_process_to_job_object(job: RawHandle, process: RawHandle) -> i32;
    #[link_name = "TerminateJobObject"]
    fn terminate_job_object(job: RawHandle, exit_code: u32) -> i32;
    #[link_name = "CreateToolhelp32Snapshot"]
    fn create_toolhelp32_snapshot(flags: u32, process_id: u32) -> RawHandle;
    #[link_name = "Thread32First"]
    fn thread32_first(snapshot: RawHandle, entry: *mut ThreadEntry32) -> i32;
    #[link_name = "Thread32Next"]
    fn thread32_next(snapshot: RawHandle, entry: *mut ThreadEntry32) -> i32;
    #[link_name = "OpenThread"]
    fn open_thread(desired_access: u32, inherit_handle: i32, thread_id: u32) -> RawHandle;
    #[link_name = "ResumeThread"]
    fn resume_thread(thread: RawHandle) -> u32;
}

/// Native child-process owner used by bounded BandScope subprocess boundaries.
///
/// On Windows the retained Job Object handle keeps the direct child and its ordinary
/// descendants in one lifetime boundary. On other platforms termination delegates to
/// the existing process-group owner in `runtime_core`.
pub struct OwnedProcess {
    child: Child,
    #[cfg(windows)]
    job: OwnedHandle,
}

impl OwnedProcess {
    /// Take the child's captured stdin pipe exactly once.
    pub fn take_stdin(&mut self) -> Option<ChildStdin> {
        self.child.stdin.take()
    }

    /// Take the child's captured stdout pipe exactly once.
    pub fn take_stdout(&mut self) -> Option<ChildStdout> {
        self.child.stdout.take()
    }

    /// Take the child's captured stderr pipe exactly once.
    pub fn take_stderr(&mut self) -> Option<ChildStderr> {
        self.child.stderr.take()
    }

    /// Observe direct-child completion without waiting for descendant cleanup.
    pub fn try_wait(&mut self) -> io::Result<Option<ExitStatus>> {
        self.child.try_wait()
    }

    /// Terminate the owned process boundary and reap the directly owned child.
    pub fn terminate(&mut self) {
        #[cfg(windows)]
        {
            // SAFETY: `job` is a live handle created by `CreateJobObjectW` and retained
            // for this `OwnedProcess`. Terminating the job is the documented tree-wide
            // cleanup path; direct-child kill remains a fail-closed fallback.
            if unsafe { terminate_job_object(self.job.as_raw_handle(), 1) } == 0 {
                let _ = self.child.kill();
            }
            let _ = self.child.wait();
        }

        #[cfg(not(windows))]
        terminate_owned_process(&mut self.child);
    }
}

#[cfg(windows)]
fn create_kill_on_close_job() -> io::Result<OwnedHandle> {
    // SAFETY: null security/name pointers request an unnamed Job Object with default
    // security. A non-null result is converted immediately into an owning Rust handle.
    let raw_job = unsafe { create_job_object(ptr::null(), ptr::null()) };
    if raw_job.is_null() {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: `raw_job` is a newly created, non-null owning handle from Win32.
    let job = unsafe { OwnedHandle::from_raw_handle(raw_job) };

    // SAFETY: all-zero is a valid initial state for this C POD structure. Only the
    // documented `LimitFlags` field is then enabled.
    let mut limits: JobObjectExtendedLimitInformation = unsafe { zeroed() };
    limits.basic_limit_information.limit_flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    // SAFETY: the pointer and byte length describe the live stack value for the duration
    // of the call, and `job` is a valid Job Object handle.
    let configured = unsafe {
        set_information_job_object(
            job.as_raw_handle(),
            JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS,
            (&limits as *const JobObjectExtendedLimitInformation).cast(),
            size_of::<JobObjectExtendedLimitInformation>() as u32,
        )
    };
    if configured == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(job)
}

#[cfg(windows)]
fn resume_suspended_child(process_id: u32) -> io::Result<()> {
    // SAFETY: Toolhelp returns either INVALID_HANDLE_VALUE or a snapshot handle owned
    // by the caller. The snapshot is wrapped immediately on success.
    let raw_snapshot = unsafe { create_toolhelp32_snapshot(TH32CS_SNAPTHREAD, 0) };
    if raw_snapshot as isize == -1 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: successful Toolhelp snapshot handles are caller-owned kernel handles.
    let snapshot = unsafe { OwnedHandle::from_raw_handle(raw_snapshot) };

    // SAFETY: all-zero is a valid starting representation when `size` is set before
    // the Toolhelp call, as required by the Win32 THREADENTRY32 contract.
    let mut entry: ThreadEntry32 = unsafe { zeroed() };
    entry.size = size_of::<ThreadEntry32>() as u32;
    // SAFETY: `snapshot` is valid and `entry` points to writable storage of the declared size.
    let mut has_entry = unsafe { thread32_first(snapshot.as_raw_handle(), &mut entry) } != 0;
    while has_entry {
        if entry.owner_process_id == process_id {
            // SAFETY: the thread id came from the current Toolhelp snapshot. The handle is
            // requested only for suspend/resume and wrapped immediately on success.
            let raw_thread = unsafe { open_thread(THREAD_SUSPEND_RESUME, 0, entry.thread_id) };
            if raw_thread.is_null() {
                return Err(io::Error::last_os_error());
            }
            // SAFETY: `raw_thread` is a newly opened owning thread handle.
            let thread = unsafe { OwnedHandle::from_raw_handle(raw_thread) };
            // SAFETY: the child was created with CREATE_SUSPENDED, so its initial thread
            // must have a positive suspend count before product code is allowed to run.
            let previous_suspend_count = unsafe { resume_thread(thread.as_raw_handle()) };
            if previous_suspend_count == u32::MAX {
                return Err(io::Error::last_os_error());
            }
            if previous_suspend_count == 0 {
                return Err(io::Error::other(
                    "BandScope child was not suspended before Job Object admission",
                ));
            }
            return Ok(());
        }
        // SAFETY: same valid snapshot and writable THREADENTRY32 storage as above.
        has_entry = unsafe { thread32_next(snapshot.as_raw_handle(), &mut entry) } != 0;
    }

    Err(io::Error::new(
        io::ErrorKind::NotFound,
        "BandScope could not locate the suspended child thread",
    ))
}

/// Spawn one BandScope-owned subprocess without a Windows descendant-admission race.
///
/// Windows creates the direct child suspended, assigns it to an unnamed Job Object with
/// `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, and resumes its initial thread only after that
/// assignment succeeds. Child code therefore cannot create an ordinary descendant before
/// Job membership exists. Non-Windows targets preserve the existing pre-spawn process-group
/// configuration. Renderer code never receives a PID, Job handle, or generic kill capability.
pub fn spawn_owned_process(command: &mut Command) -> io::Result<OwnedProcess> {
    #[cfg(windows)]
    {
        let job = create_kill_on_close_job()?;
        command.creation_flags(CREATE_SUSPENDED);
        let mut child = command.spawn()?;

        // SAFETY: both handles are live kernel handles. The direct child is still suspended,
        // so no product code or descendant creation can run before this assignment returns.
        if unsafe { assign_process_to_job_object(job.as_raw_handle(), child.as_raw_handle()) } == 0 {
            let error = io::Error::last_os_error();
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }

        if let Err(error) = resume_suspended_child(child.id()) {
            // SAFETY: `job` owns the still-suspended child at this point; terminate the
            // admitted boundary before returning the setup failure.
            if unsafe { terminate_job_object(job.as_raw_handle(), 1) } == 0 {
                let _ = child.kill();
            }
            let _ = child.wait();
            return Err(error);
        }

        return Ok(OwnedProcess { child, job });
    }

    #[cfg(not(windows))]
    {
        configure_owned_process(command);
        let child = command.spawn()?;
        Ok(OwnedProcess { child })
    }
}
