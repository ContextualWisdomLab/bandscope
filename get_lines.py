import sys

def main():
    if len(sys.argv) != 4:
        print("Usage: python get_lines.py <filepath> <start_line> <end_line>")
        sys.exit(1)

    filepath = sys.argv[1]
    start_line = int(sys.argv[2])
    end_line = int(sys.argv[3])

    try:
        with open(filepath, 'r') as f:
            lines = f.readlines()
            for i in range(start_line - 1, end_line):
                print(lines[i], end="")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
