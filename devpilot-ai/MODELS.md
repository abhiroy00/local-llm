# Free local DeepSeek models

DevPilot uses DeepSeek weights published by the official `deepseek-ai` Hugging Face organization, served locally by Ollama. The setup panel downloads Ollama's quantized distributions of those checkpoints. It does not call Hugging Face hosted inference or DeepSeek's paid API, and it does not download full-precision Transformers checkpoints.

## MacBook Air M5, 16 GB RAM, 512 GB storage

Start conservatively with **DeepSeek Coder 1.3B**, `deepseek-coder:1.3b`, and the default **low-memory** profile. It is less capable and has not passed a real coding benchmark in this session. The larger Coder 6.7B download (~3.8 GB) completed, but its native coding smoke test was interrupted when the user reported a machine hang; it is not validated on this Mac. For reasoning, the optional **DeepSeek R1 8B**, `deepseek-r1:8b`, is approximately 5.2 GB. These are model-file sizes, not total runtime RAM requirements. Context/KV cache, Ollama, VS Code and macOS need additional memory. Prefer one loaded model and close memory-heavy applications if swapping occurs.

Your disk capacity does not determine model capacity: RAM is the limiting factor. The full-size DeepSeek models are not appropriate for this 16 GB setup. Low-memory mode blocks the larger catalog profiles before inference and caps context at 4096. It limits output to 768 tokens, prompt batches to 64, CPU threads to four and model retention to 30 seconds. These are resource limits, not a guarantee against hangs. Balanced mode is an explicit advanced setting for longer/heavier work; do not enable it while diagnosing this incident. Model quality and speed depend on the task and machine; no frontier-agent parity is promised.

## Setup in the sidebar (Mac and Windows)

1. Install and start Ollama for your OS.
2. Open DevPilot in VS Code 1.106+.
3. Click the model-chip icon, or run **DevPilot AI: Set Up DeepSeek Models** from the Command Palette.
4. Choose **Download** on a model card. Progress is per layer. Stop cancels this client's request; Ollama may retain cached layers for a retry.
5. On completion the model is selected automatically. Installed models have a **Use model** button. The selection is saved locally.

Downloads require an internet connection and several GB of disk space. Source buttons open official Hugging Face model cards with license information. Inference requests and project excerpts go to the configured loopback Ollama endpoint, not Hugging Face or DeepSeek's cloud API. The model-setup UI shows total host RAM and estimated free space on the home drive; Ollama may use a different drive if `OLLAMA_MODELS` is configured separately.

## Terminal setup

These commands work in macOS Terminal and Windows PowerShell after installing Ollama:

```sh
ollama pull deepseek-coder:1.3b
ollama list
```

Alternatively, from this repository (Ollama must already be running):

```sh
npm run model:setup -- deepseek-small
```

Other profile IDs are `deepseek-coder` and `deepseek-reasoning`; downloading them does not enable their inference in low-memory mode. This helper only downloads catalog profiles; it does not accept cloud URLs or arbitrary model repositories. No models are bundled in the extension package.

## Official sources and distributions

| Profile | Official checkpoint | Quantized distribution |
|---|---|---|
| Coder 6.7B | [DeepSeek Coder 6.7B Instruct](https://huggingface.co/deepseek-ai/deepseek-coder-6.7b-instruct) | [Ollama 6.7B, ~3.8 GB](https://ollama.com/library/deepseek-coder:6.7b) |
| R1 8B | [DeepSeek R1 0528 Qwen3 8B](https://huggingface.co/deepseek-ai/DeepSeek-R1-0528-Qwen3-8B) | [Ollama 8B, ~5.2 GB](https://ollama.com/library/deepseek-r1:8b) |
| Coder 1.3B | [DeepSeek Coder 1.3B Instruct](https://huggingface.co/deepseek-ai/deepseek-coder-1.3b-instruct) | [Ollama 1.3B](https://ollama.com/library/deepseek-coder:1.3b) |

R1's model card uses MIT; Coder uses the DeepSeek model license. Free access to weights does not replace the applicable license terms. DeepSeek's [hosted API has token pricing](https://api-docs.deepseek.com/quick_start/pricing/); this extension does not configure it.

## Reasoning and tool behavior

DevPilot requests `think:false` for DeepSeek R1 tool/chat calls so the final response has more room within the bounded output budget. Actual support depends on the Ollama/model version. Separate reasoning fields are not displayed or interpreted as tool calls. Older leading `<think>...</think>` content is filtered for DeepSeek R1 only; unfinished/no-final-answer responses fail clearly. This does not guarantee correct decisions. Architecture provenance checks, approval, stale-file guards and command restrictions still apply.

## Validation commands

```sh
npm run check
npm run test:host
npm run smoke:coding -- deepseek-coder:1.3b
```

Do not rerun real-model smoke tests until the machine is responsive and you deliberately choose to test inference. No DeepSeek benchmark was rerun after the reported hang. A later explicitly authorized Qwen 3B calculator edit/test/undo trial passed in low-memory mode; see VALIDATION.md.

The optional real-model coding smoke test creates an isolated VS Code profile and disposable workspace, asks the model to fix a disposable JavaScript calculator bug, then requires an actual edit, a passing npm test, an independent rerun and byte-exact undo with the original failing tests restored. Test approvals are supplied by the fixture callback. It never edits the user's open project. A passing tiny fixture is evidence of the tested flow, not a general coding benchmark.

## Interrupted test and recovery

The precise cause of the reported hang is unconfirmed. The test harness retained unbounded verbose editor output, and the response grammars included large string/array bounds. Both have been changed: log capture is capped at 256 KiB with verbose logging removed; grammar size bounds are omitted while host Zod validation remains enforced. The harness now terminates its process group/tree on timeout/interruption, with a three-minute maximum for optional model tests. No leftover test or Ollama runner processes were found during recovery. These changes are covered by non-inference checks, not a repeat of the workload that hung the machine.
