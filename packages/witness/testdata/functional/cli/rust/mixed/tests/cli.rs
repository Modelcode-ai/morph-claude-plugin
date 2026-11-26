use assert_cmd::Command;

#[test]
fn lists_items() {
    Command::cargo_bin("itemsctl").unwrap().assert().success().stdout("apple\npear\n");
}
