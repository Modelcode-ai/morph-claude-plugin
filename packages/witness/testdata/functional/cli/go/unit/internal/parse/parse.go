package parse

func Cmd(args []string) string {
	if len(args) == 0 {
		return "list"
	}
	return args[0]
}
