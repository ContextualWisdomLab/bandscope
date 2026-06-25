with open(".github/workflows/opencode-review.yml", "r") as f:
    content = f.read()

# Replace the initial GH_TOKEN as well, right at the start of the step
content = content.replace(
'''          if [ -n "${OPENCODE_APP_TOKEN:-}" ]; then
            export GH_TOKEN="$OPENCODE_APP_TOKEN"
            approval_token_source="opencode-app"
          elif [ -n "${OPENCODE_APPROVE_TOKEN:-}" ]; then
            export GH_TOKEN="$OPENCODE_APPROVE_TOKEN"
            approval_token_source="opencode-approve-token"
          fi''',
'''          if [ -n "${OPENCODE_APP_TOKEN:-}" ]; then
            export GH_TOKEN="$OPENCODE_APP_TOKEN"
            approval_token_source="opencode-app"
          elif [ -n "${OPENCODE_APPROVE_TOKEN:-}" ]; then
            export GH_TOKEN="$OPENCODE_APPROVE_TOKEN"
            approval_token_source="opencode-approve-token"
          fi
          # Save initial token in case it gets overwritten
          export INITIAL_GH_TOKEN="${GH_TOKEN:-}"''')

# Now also fix the retry loop to use the INITIAL_GH_TOKEN
content = content.replace(
'''              if [ "$attempt" -lt "$attempts" ]; then
                printf 'GitHub Checks lookup failed; retrying %s/%s before changing review state.\\n' "$attempt" "$attempts" >&2
                export GH_TOKEN="${OPENCODE_APP_TOKEN:-${OPENCODE_APPROVE_TOKEN:-$GH_TOKEN}}"
                sleep "$sleep_seconds"
              fi''',
'''              if [ "$attempt" -lt "$attempts" ]; then
                printf 'GitHub Checks lookup failed; retrying %s/%s before changing review state.\\n' "$attempt" "$attempts" >&2
                export GH_TOKEN="${INITIAL_GH_TOKEN:-$GH_TOKEN}"
                sleep "$sleep_seconds"
              fi''')

with open(".github/workflows/opencode-review.yml", "w") as f:
    f.write(content)
