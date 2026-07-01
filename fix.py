with open(".github/workflows/opencode-review.yml", "r") as f:
    text = f.read()

text = text.replace('--slurpfile control "$control_json"', '--argjson control "[$(cat \\"$control_json\\")]"')
text = text.replace('--paginate \\\n              --jq', '\\\n              --jq')
text = text.replace('--paginate \\\n                --jq', '\\\n                --jq')
text = text.replace('--paginate \\\n            --jq', '\\\n            --jq')
with open(".github/workflows/opencode-review.yml", "w") as f:
    f.write(text)
