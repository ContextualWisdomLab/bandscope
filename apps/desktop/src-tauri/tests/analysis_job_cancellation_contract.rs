fn capability_permissions_include(value: &serde_json::Value, expected: &str) -> bool {
    value
        .pointer("/main-capability/permissions")
        .and_then(serde_json::Value::as_array)
        .is_some_and(|permissions| {
            permissions
                .iter()
                .any(|permission| permission.as_str() == Some(expected))
        })
}

fn desktop_schema_identifier_const(value: &serde_json::Value, expected: &str) -> bool {
    value
        .pointer("/definitions/Identifier/oneOf")
        .and_then(serde_json::Value::as_array)
        .is_some_and(|identifiers| {
            identifiers.iter().any(|identifier| {
                identifier
                    .get("const")
                    .and_then(serde_json::Value::as_str)
                    == Some(expected)
            })
        })
}

#[test]
fn native_analysis_cancellation_contains_the_running_process_boundary() {
    let source = include_str!("../src/main.rs");
    let runner_start = source
        .find("fn run_analysis_engine(")
        .expect("analysis process runner must remain present");
    let runner_tail = &source[runner_start..];
    let runner_end = runner_tail
        .find("\n}\n\n#[tauri::command]\nfn start_analysis_job")
        .expect("analysis process runner boundary must remain inspectable");
    let runner = &runner_tail[..runner_end];

    assert!(
        runner.contains("cancellation_state.is_requested(&job_id)"),
        "the native runner must observe cancellation at the process boundary"
    );
    assert!(
        runner.contains("configure_owned_process(&mut command)"),
        "the owned analysis process must use the shared core containment owner before spawn"
    );
    assert!(
        runner.contains("terminate_owned_process(&mut process)"),
        "accepted cancellation and failure paths must use the shared core containment owner before reporting terminal status"
    );
    assert!(
        !runner.contains("process.kill()"),
        "the runner must not bypass the containment helper with direct-child-only termination"
    );
    assert!(
        runner.contains("cancelled_status("),
        "process cancellation must end in a dedicated machine-readable cancellation status"
    );
}

#[test]
fn analysis_process_containment_uses_the_shared_core_owner() {
    let source = include_str!("../src/main.rs");
    let core = include_str!("../../core/src/lib.rs");
    let core_runtime = include_str!("../../core/tests/youtube_process_containment.rs");
    let tauri_runtime = include_str!("youtube_process_containment_runtime.rs");
    let supported_guard = "#[cfg(any(target_os = \"linux\", target_os = \"macos\"))]";

    assert!(
        source.contains("configure_owned_process(&mut command)"),
        "the Tauri analysis runner must delegate process-group configuration to desktop core"
    );
    assert!(
        source.contains("terminate_owned_process(&mut process)"),
        "the Tauri analysis runner must delegate process termination to desktop core"
    );
    assert!(
        !source.contains("fn configure_analysis_process("),
        "the Tauri adapter must not duplicate low-level process-group configuration"
    );
    assert!(
        !source.contains("fn terminate_analysis_process("),
        "the Tauri adapter must not duplicate low-level process-group termination"
    );
    assert!(
        !source.contains("posix_kill(-process_group_id, SIGKILL)"),
        "POSIX signalling belongs to the GUI-independent desktop-core owner"
    );

    assert!(
        core.contains("pub fn configure_owned_process(command: &mut Command)"),
        "desktop core must expose the canonical process configuration boundary"
    );
    assert!(
        core.contains("pub fn terminate_owned_process(child: &mut Child)"),
        "desktop core must expose the canonical process termination boundary"
    );
    assert!(
        core.contains(&format!("{supported_guard}\n    command.process_group(0);")),
        "process-group setup must be enabled only where group termination is implemented"
    );
    assert!(
        core.contains("posix_kill(-process_group_id, SIGKILL)"),
        "the canonical Unix owner must signal the owned process group"
    );
    assert!(
        core.contains("let _ = child.wait();"),
        "the canonical owner must still reap the directly owned child"
    );
    assert!(
        core_runtime.contains(&format!(
            "{supported_guard}\n#[test]\nfn youtube_timeout_terminates_descendant_that_keeps_output_pipe_open()"
        )),
        "the core descendant-containment runtime regression must run only on supported targets"
    );
    assert!(
        tauri_runtime.starts_with(supported_guard),
        "the Tauri descendant-containment runtime regression must run only on supported targets"
    );
}

#[test]
fn final_job_commit_serializes_cancellation_against_terminal_status() {
    let source = include_str!("../src/main.rs");
    let finalizer_start = source
        .find("fn finalize_analysis_status_and_emit<")
        .expect("analysis worker needs one serialized terminal-status finalizer");
    let finalizer_tail = &source[finalizer_start..];
    let finalizer_end = finalizer_tail
        .find("\n}\n\nfn store_bootstrap_source")
        .expect("terminal-status finalizer boundary must remain inspectable");
    let finalizer = &finalizer_tail[..finalizer_end];

    let jobs_lock = finalizer
        .find("state.0.jobs.lock()")
        .expect("finalization must hold the job-status lock");
    let cancellation_take = finalizer
        .find("cancellation_state.take_requested(&finished.job_id)")
        .expect("finalization must consume any accepted cancellation request");
    let terminal_store = finalizer
        .find("jobs.insert(finished.job_id.clone(), final_status.clone())")
        .expect("finalization must store exactly one terminal status while the job lock is held");

    assert!(
        jobs_lock < cancellation_take && cancellation_take < terminal_store,
        "cancellation acceptance and terminal status publication must be serialized under the same job-status lock"
    );

    let worker_start = source
        .find("let finished = run_analysis_engine(")
        .expect("analysis worker must still delegate execution to the engine runner");
    let worker_tail = &source[worker_start..];
    let worker_end = worker_tail
        .find("\n        release_job_slot(&app_state);")
        .expect("analysis worker must still release its in-flight slot");
    let worker_finalization = &worker_tail[..worker_end];

    assert!(
        worker_finalization.contains("finalize_analysis_status_and_emit("),
        "the worker must route terminal publication through the serialized cancellation-aware finalizer"
    );
    assert!(
        !worker_finalization.contains("worker_cancellation_state.clear(&job_id)"),
        "the worker must not clear cancellation before terminal status is serialized"
    );
}

#[test]
fn queued_cancellation_uses_the_same_serialized_finalizer() {
    let source = include_str!("../src/main.rs");
    let worker_start = source
        .find("std::thread::spawn(move || {")
        .expect("analysis worker must remain present");
    let worker_tail = &source[worker_start..];
    let running_publish = worker_tail
        .find("        store_status_and_emit(\n            &app_state,")
        .expect("worker must still publish the running transition");
    let queued_cancel_path = &worker_tail[..running_publish];

    assert!(
        queued_cancel_path.contains("worker_cancellation_state.is_requested(&job_id)"),
        "queued cancellation must still be observed before running work starts"
    );
    assert!(
        queued_cancel_path.contains("finalize_analysis_status_and_emit("),
        "queued cancellation must use the same serialized terminal finalizer as running cancellation"
    );
    assert!(
        !queued_cancel_path.contains("worker_cancellation_state.clear(&job_id)"),
        "queued cancellation must not clear the registry before terminal status is committed"
    );
}

#[test]
fn cancel_command_holds_job_authority_while_accepting_a_request() {
    let source = include_str!("../src/main.rs");
    let command_start = source
        .find("fn cancel_analysis_job(")
        .expect("job-specific cancellation command must remain present");
    let command_tail = &source[command_start..];
    let command_end = command_tail
        .find("\n}\n\n#[tauri::command]\nfn select_local_audio_source")
        .expect("cancellation command boundary must remain inspectable");
    let command = &command_tail[..command_end];

    let jobs_guard = command
        .find("let jobs = match state.0.jobs.lock()")
        .expect("cancellation acceptance must retain the job-status lock guard");
    let request = command
        .find("cancellation_state.request(&job_id)")
        .expect("queued or running jobs must record a cancellation request");

    assert!(
        jobs_guard < request,
        "the job-status lock must remain in scope until cancellation acceptance is recorded"
    );
}

#[test]
fn cancellation_is_an_allowlisted_job_specific_tauri_command() {
    let source = include_str!("../src/main.rs");

    assert!(
        source.contains("fn cancel_analysis_job("),
        "the renderer boundary needs one job-specific cancellation command rather than generic process authority"
    );
    assert!(
        source.contains("cancel_analysis_job,\n            save_project"),
        "the cancellation command must be explicitly registered in the Tauri invoke handler"
    );
    assert!(
        source.contains("AnalysisJobCancellationRegistry::default()"),
        "cancellation requests need a native state owner shared by commands and the worker"
    );
    assert!(
        source.contains("AnalysisJobErrorCode::Cancelled"),
        "cancelled work must not be mislabeled as an unavailable engine"
    );
}

#[test]
fn cancellation_is_declared_and_granted_in_the_tauri_capability_boundary() {
    let build_manifest = include_str!("../build.rs");
    let main_capability = include_str!("../capabilities/main.json");
    let generated_permission =
        include_str!("../permissions/autogenerated/cancel_analysis_job.toml");

    assert!(
        build_manifest.contains("\"cancel_analysis_job\""),
        "the Tauri build manifest must generate a command permission for cancellation"
    );
    assert!(
        main_capability.contains("\"allow-cancel-analysis-job\""),
        "the main window must be granted the generated cancellation permission"
    );
    assert!(
        generated_permission.contains("identifier = \"allow-cancel-analysis-job\"")
            && generated_permission.contains("commands.allow = [\"cancel_analysis_job\"]"),
        "the generated permission contract must bind only the cancellation command"
    );
}

#[test]
fn generated_tauri_schemas_include_the_cancellation_permission() {
    let generated_capabilities: serde_json::Value =
        serde_json::from_str(include_str!("../gen/schemas/capabilities.json"))
            .expect("generated capability snapshot must remain valid JSON");
    let desktop_schema: serde_json::Value =
        serde_json::from_str(include_str!("../gen/schemas/desktop-schema.json"))
            .expect("generated desktop schema must remain valid JSON");

    assert!(
        capability_permissions_include(&generated_capabilities, "allow-cancel-analysis-job"),
        "the generated main capability must grant the cancellation permission in its permissions array"
    );
    assert!(
        desktop_schema_identifier_const(&desktop_schema, "allow-cancel-analysis-job")
            && desktop_schema_identifier_const(&desktop_schema, "deny-cancel-analysis-job"),
        "the generated desktop schema must enumerate the cancellation allow/deny identifiers as permission constants"
    );
}
