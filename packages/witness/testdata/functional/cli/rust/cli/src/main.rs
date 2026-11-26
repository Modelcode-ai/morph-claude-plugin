fn main() {
    println!("{}", items().join("\n"));
}

fn items() -> Vec<&'static str> {
    vec!["apple", "pear"]
}
