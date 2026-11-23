fn main() {
    println!("{}", items().join("\n"));
}

fn items() -> Vec<&'static str> {
    vec!["apple", "pear"]
}

#[cfg(test)]
mod tests {
    #[test]
    fn two_items() {
        assert_eq!(super::items().len(), 2);
    }
}
