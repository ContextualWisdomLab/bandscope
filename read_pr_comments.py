import os
import sys

def main():
    try:
        from default_api import read_pr_comments
        print(read_pr_comments())
    except Exception as e:
        print(f"Failed to use the tool: {e}")

if __name__ == "__main__":
    main()
