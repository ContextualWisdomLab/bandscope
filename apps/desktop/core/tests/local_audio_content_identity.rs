use bandscope_desktop_core::copy_bounded_local_audio_with_receipt;
use std::io::Cursor;

#[test]
fn local_audio_copy_receipt_hashes_exact_admitted_bytes() {
    let input = vec![1_u8, 2, 3, 4];
    let mut staged = Vec::new();

    let receipt = copy_bounded_local_audio_with_receipt(Cursor::new(&input), &mut staged)
        .expect("bounded admission should return content identity for the bytes it stages");

    assert_eq!(staged, input);
    assert_eq!(receipt.file_size_bytes, 4);
    assert_eq!(
        receipt.content_sha256,
        "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a"
    );
}
