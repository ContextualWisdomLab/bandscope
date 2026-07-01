import re

with open('.github/workflows/opencode-review.yml', 'r') as f:
    content = f.read()

search1 = '''          overview_comment_id="$(
            gh api -X GET "repos/${GH_REPOSITORY}/issues/${PR_NUMBER}/comments" --paginate \\
              --jq '[.[] | select((.user.login == "github-actions[bot]" or .user.login == "opencode-agent[bot]") and (.body | contains("<!-- opencode-review-overview -->")))] | sort_by(.created_at) | last.id // empty'
          )"'''

replace1 = '''          overview_comment_id="$(
            gh api -X GET "repos/${GH_REPOSITORY}/issues/${PR_NUMBER}/comments" --paginate | \\
              jq -r '[.[] | select((.user.login == "github-actions[bot]" or .user.login == "opencode-agent[bot]") and (.body | contains("<!-- opencode-review-overview -->")))] | sort_by(.created_at) | last.id // empty'
          )"'''

content = content.replace(search1, replace1)

search2 = '''            overview_comment_id="$(
              env GH_TOKEN="$overview_comment_token" \\
                gh api -X GET "repos/${GH_REPOSITORY}/issues/${PR_NUMBER}/comments" --paginate \\
                --jq '[.[] | select((.user.login == "github-actions[bot]" or .user.login == "opencode-agent[bot]") and (.body | contains("<!-- opencode-review-overview -->")))] | sort_by(.created_at) | last.id // empty'
            )"'''

replace2 = '''            overview_comment_id="$(
              env GH_TOKEN="$overview_comment_token" \\
                gh api -X GET "repos/${GH_REPOSITORY}/issues/${PR_NUMBER}/comments" --paginate | \\
                jq -r '[.[] | select((.user.login == "github-actions[bot]" or .user.login == "opencode-agent[bot]") and (.body | contains("<!-- opencode-review-overview -->")))] | sort_by(.created_at) | last.id // empty'
            )"'''

content = content.replace(search2, replace2)

search3 = '''          comment_json="$(
            gh api -X GET "repos/${GH_REPOSITORY}/issues/${PR_NUMBER}/comments" --paginate \\
              --jq "[.[] | select((.user.login == \\"github-actions[bot]\\" or .user.login == \\"opencode-agent[bot]\\") and (.body | contains(\\"${sentinel}\\")))] | sort_by(.created_at) | last // {}"
          )"'''

replace3 = '''          comment_json="$(
            gh api -X GET "repos/${GH_REPOSITORY}/issues/${PR_NUMBER}/comments" --paginate | \\
              jq "[.[] | select((.user.login == \\"github-actions[bot]\\" or .user.login == \\"opencode-agent[bot]\\") and (.body | contains(\\"${sentinel}\\")))] | sort_by(.created_at) | last // {}"
          )"'''

content = content.replace(search3, replace3)

with open('.github/workflows/opencode-review.yml', 'w') as f:
    f.write(content)
