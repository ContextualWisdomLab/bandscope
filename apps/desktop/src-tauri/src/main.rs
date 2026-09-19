#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![cfg_attr(feature = "persistence_warning_gate", deny(warnings))]

mod analysis_source;
mod project_load;
mod project_persistence;
mod project_root;

use analysis_source::revalidate_local_audio_bootstrap_for_analysis;
use bandscope_desktop_core::*;
use rfd::FileDialog;
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{atomic::Ordering, mpsc},
    thread,
    time::Instant,
};
use tauri::{Emitter, Manager, Runtime};