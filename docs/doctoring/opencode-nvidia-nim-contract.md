# Local OpenCode NVIDIA NIM contract

Next action: keep root `opencode.jsonc` on NVIDIA NIM only. Bind `{env:NVIDIA_API_KEY}` to
`https://integrate.api.nvidia.com/v1`. Do not rename that local binding to the organization
secret name `NVIDIA_NIM_API_KEY`. Do not put OpenAI-style `reasoningEffort` on
`nvidia/llama-3.3-nemotron-super-49b-v1.5`.

## Why this lock exists

Local developer OpenCode is a separate trust boundary from central OpenCode Review and the
PR review/merge scheduler in `ContextualWisdomLab/.github`. Those workflows keep their own
credential names. This repository only records the local client allowlist.

NVIDIA NIM reasoning models use `chat_template_kwargs` (for example `enable_thinking`) rather
than the OpenAI `reasoning_effort` field. NVIDIA documents `reasoning_effort` as a Chat
Completions knob for GPT-OSS models on multi-LLM NIM, not for Llama 3.3 Nemotron Super 49B
v1.5 (NVIDIA, n.d.-a; NVIDIA, n.d.-b). Forwarding `reasoningEffort` from OpenCode can be
ignored or rejected. The contract therefore forbids the field.

The organization GitHub secret remains `NVIDIA_NIM_API_KEY`. CI maps that secret onto process
env `NVIDIA_API_KEY` because that is the NVIDIA/OpenCode client binding.

## Held values

- `enabled_providers`: `["nvidia-nim"]`
- default model: `nvidia-nim/nvidia/llama-3.3-nemotron-super-49b-v1.5`
- `small_model`: `nvidia-nim/meta/llama-3.3-70b-instruct`
- `apiKey`: `{env:NVIDIA_API_KEY}`
- leftover deny-list: `github-models`, `STRIX_GITHUB_MODELS_TOKEN`, `COPILOT_GITHUB_TOKEN`,
  `openai/gpt-5`, `openai/o3`, `openai/o4-mini`, `models.github.ai`

## References

NVIDIA. (n.d.-a). *Use reasoning models with NVIDIA NIM for LLMs*.
https://docs.nvidia.com/nim/large-language-models/latest/reasoning-model.html

NVIDIA. (n.d.-b). *nvidia / llama-3.3-nemotron-super-49b-v1.5*.
https://docs.api.nvidia.com/nim/reference/nvidia-llama-3_3-nemotron-super-49b-v1_5

## Security Notes

- Attack surface: local OpenCode HTTPS calls to `https://integrate.api.nvidia.com/v1` using a
  process-env API key.
- Trust boundary: untrusted prompts and repository contents sent to the provider; trusted
  repo-controlled provider allowlist; secret name `NVIDIA_NIM_API_KEY` stays in GitHub and is
  mapped onto `NVIDIA_API_KEY` only at process start.
- Mitigations: single enabled provider, no GitHub Models or Copilot token fallback, leftover
  string deny-list, and an explicit ban on `reasoningEffort` plus `{env:NVIDIA_NIM_API_KEY}`
  inside `opencode.jsonc`.
- Test points: `test_opencode_uses_nvidia_nim_only` and
  `test_opencode_uses_the_canonical_nvidia_nim_contract`.
