---
name: deepinfra
description: Working with DeepInfra for AI inference. Use when the user mentions DeepInfra, deepinfra.com, needs model selection guidance, pricing lookup, API configuration, or integration help. Covers text generation, embeddings, image generation, speech recognition, computer vision, and all supported model types. Also trigger on model ID questions, comparing inference providers, rate limits, webhooks, scoped JWTs, function calling, JSON mode, multimodal inputs, log probabilities, framework integrations (LangChain, LlamaIndex, Vercel AI SDK, AutoGen), or when the user wants to verify correct model names/IDs for DeepInfra.
---

# DeepInfra Integration Guide

## Overview

DeepInfra is an AI inference platform providing access to open-source LLMs, embeddings, image generation, speech recognition, and computer vision models via OpenAI-compatible and native APIs.

**Key resources:**
- Models catalog: https://deepinfra.com/models
- Pricing: https://deepinfra.com/pricing
- API docs: https://deepinfra.com/docs/api-reference
- Dashboard / API keys: https://deepinfra.com/dashboard

---

## API Options

### 1. OpenAI-Compatible API (Recommended for LLMs + Embeddings)

Base URL: `https://api.deepinfra.com/v1/openai`

Supports: chat completions, text completions, embeddings (streaming and non-streaming).

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.DEEPINFRA_TOKEN,
  baseURL: "https://api.deepinfra.com/v1/openai",
});

const chat = await client.chat.completions.create({
  model: "meta-llama/Meta-Llama-3-8B-Instruct",
  messages: [{ role: "user", content: "Hello" }],
});
```

```python
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["DEEPINFRA_TOKEN"],
    base_url="https://api.deepinfra.com/v1/openai"
)
```

### 2. DeepInfra Native API

Base URL: `https://api.deepinfra.com/v1/inference/{model_id}`

Auth: `Authorization: bearer $DEEPINFRA_TOKEN`

Supports all model categories + exclusive features: webhooks, log probabilities, streaming inference status.

```javascript
import { TextGeneration } from "deepinfra";

const client = new TextGeneration(
  "meta-llama/Meta-Llama-3-8B-Instruct",
  process.env.DEEPINFRA_TOKEN
);

const res = await client.generate({
  input: "<|begin_of_text|>...",
  stop: ["<|eot_id|>"],
  max_new_tokens: 512,
  temperature: 0.7,
});
// res.results[0].generated_text
// res.inference_status.cost
```

---

## Authentication Methods

| Method | Format |
|--------|--------|
| Standard API key | `Authorization: bearer $DEEPINFRA_TOKEN` |
| OpenAI client | `api_key="$DEEPINFRA_TOKEN"` |
| Scoped JWT | `jwt:<header>.<payload>.<signature>` (used like a regular key) |
| Okta SSO | OpenID Connect via DeepInfra login or IdP-initiated |

---

## Model ID Schema

Model IDs follow `provider/model-name` format:
- `meta-llama/Meta-Llama-3.1-8B-Instruct`
- `deepseek-ai/DeepSeek-V3`
- `BAAI/bge-large-en-v1.5` (embeddings)
- `black-forest-labs/FLUX-1-schnell` (image generation)
- `openai/whisper-base` (speech recognition)

Some models support versioning: `MODEL_NAME:VERSION` or `deploy_id:DEPLOY_ID`.

---

## Supported Model Categories

| Category | Native API class | OpenAI-compatible endpoint |
|----------|------------------|---------------------------|
| Text generation | `TextGeneration` | `/chat/completions` |
| Embeddings | `Embeddings` | `/embeddings` |
| Image generation | `TextToImage`, `Sdxl` | `/images/generate` |
| Speech recognition | `AutomaticSpeechRecognition` | N/A |
| Object detection | `ObjectDetection` | N/A |
| Image classification | `ImageClassification` | N/A |
| Zero-shot image classification | `ZeroShotImageClassification` | N/A |
| Token classification | `TokenClassification` | N/A |
| Text classification | `TextClassification` | N/A |
| Fill mask | `FillMask` | N/A |

---

## Rate Limits

**Default: 200 concurrent requests per model.**

- Limit is per model — using two models gives 400 total concurrent slots
- Slots free immediately as requests complete
- Effective RPM: ~12,000 at 1s windows, ~200 at 60s windows
- **HTTP 429** returned when limit exceeded: `{"error": "Rate limited"}`
- Request increases at: https://deepinfra.com/dashboard

**Handling:** retry after delay, token bucket for batch jobs, or request a limit increase.

---

## Webhooks (Native API only)

Add `"webhook": "https://your-endpoint.com/callback"` to any native API request for async inference.

**Immediate response:** `{"status": "queued"}`

**Callback payload on success:**
```json
{
  "request_id": "...",
  "inference_status": {
    "status": "succeeded",
    "runtime_ms": 1234,
    "cost": 0.0012
  },
  "results": { ... }
}
```

**Failure payload:** `inference_status.status = "failed"`, `cost: 0.0`

DeepInfra retries delivery if your endpoint returns a 4xx. NOT available on the OpenAI-compatible API.

---

## Scoped JWTs

Create restricted tokens for third parties without sharing your primary API key.

**Create via:** `POST /v1/scoped-jwt`

| Parameter | Description |
|-----------|-------------|
| `api_key_name` | Name of signing API key |
| `models` | Array of permitted model IDs |
| `expires_delta` | Seconds until expiry (max 604800 = 1 week) |
| `spending_limit` | Max spend in USD |

JWT format: `jwt:<base64url(header)>.<base64url(payload)>.<base64url(sig)>`

Signed with HMAC-SHA256 using API key as secret. Usage counts toward the originating key.

---

## Advanced Features

### Function Calling (OpenAI-compatible)

```json
{
  "model": "meta-llama/Meta-Llama-3.1-70B-Instruct",
  "messages": [...],
  "tools": [{
    "type": "function",
    "function": {
      "name": "get_weather",
      "description": "Get current weather",
      "parameters": {
        "type": "object",
        "properties": {
          "location": {"type": "string", "description": "City name"}
        },
        "required": ["location"]
      }
    }
  }],
  "tool_choice": "auto"
}
```

Flow: send query → model returns function name + args → client executes → add `tool` role message → send follow-up → model gives final answer.

---

### JSON Mode

Add `"response_format": {"type": "json_object"}` to any request.

**Warnings:**
- Prompt must explicitly instruct the model to return JSON — the API doesn't guarantee it otherwise
- Truncation risk: if generation hits length limits, output may be malformed
- Safety alignment may be bypassed — models can fabricate data instead of refusing harmful requests

---

### Multimodal (Vision) Models

Supported models: `meta-llama/Llama-3.2-90B-Vision-Instruct`, `meta-llama/Llama-3.2-11B-Vision-Instruct`, `Qwen/QVQ-72B-Preview`

Input: text + images (URL or base64). Output: text only.

| Constraint | Value |
|------------|-------|
| Formats | JPG, PNG, WebP |
| Max file size | 20 MB per image |
| `detail` param | Not supported |

```json
{
  "role": "user",
  "content": [
    {"type": "image_url", "image_url": {"url": "https://..."}},
    {"type": "text", "text": "Describe this image"}
  ]
}
```

Base64: `"data:image/jpeg;base64,{encoded}"`

---

### Log Probabilities (Streaming native API only)

NOT available on non-streaming or OpenAI-compatible API.

```bash
curl -X POST \
  -d '{"input": "Some text", "stream": true}' \
  -H "Authorization: bearer $DEEPINFRA_TOKEN" \
  'https://api.deepinfra.com/v1/inference/meta-llama/Llama-2-7b-chat-hf'
```

SSE response per token: `{"token": {"id": 29892, "text": ",", "logprob": -2.65625, "special": false}}`

---

### Max Output Tokens

**Hard limit: 16,384 tokens per request.**

For outputs exceeding this, use continuation — include the prior assistant response in message history and send a follow-up request. Cannot exceed the model's total context window (returns `400` if exceeded).

---

## Response Metadata (Native API)

```json
{
  "results": [...],
  "inference_status": {
    "status": "succeeded",
    "runtime_ms": 243,
    "cost": 0.0000436,
    "tokens_input": 12,
    "tokens_generated": 25
  }
}
```

OpenAI-compatible responses include `estimated_cost` in the `usage` object.

---

## Installation

```bash
# OpenAI-compatible (JS/Python)
npm install openai
pip install openai

# DeepInfra native SDK (JS)
npm install deepinfra

# Vercel AI SDK
npm install ai @ai-sdk/deepinfra

# LangChain
pip install langchain langchain-community

# LlamaIndex
pip install llama-index-llms-deepinfra llama-index-embeddings-deepinfra
```

---

## Framework Integrations

### LangChain (Python)

```python
import os
os.environ["DEEPINFRA_API_TOKEN"] = "<token>"

from langchain_community.llms import DeepInfra
llm = DeepInfra(model_id="meta-llama/Meta-Llama-3-8B-Instruct")
llm.model_kwargs = {"temperature": 0.7, "max_new_tokens": 250, "top_p": 0.9}

from langchain_community.embeddings import DeepInfraEmbeddings
embeddings = DeepInfraEmbeddings(model_id="sentence-transformers/clip-ViT-B-32")
```

Also supports `ChatDeepInfra` for message-based interactions with streaming + async.

---

### LlamaIndex (Python)

```python
from llama_index.llms.deepinfra import DeepInfraLLM
llm = DeepInfraLLM(
    model="mistralai/Mixtral-8x22B-Instruct-v0.1",
    api_key="$DEEPINFRA_TOKEN",
    temperature=0.5,
    max_tokens=50,
)

from llama_index.embeddings.deepinfra import DeepInfraEmbeddingModel
model = DeepInfraEmbeddingModel(
    model_id="BAAI/bge-large-en-v1.5",
    api_token="$DEEPINFRA_TOKEN",
    normalize=True,
)
```

Methods: `complete()`, `stream_complete()`, `chat()`, `stream_chat()` + async variants.

---

### Vercel AI SDK (JavaScript)

```javascript
import { createDeepInfra } from "@ai-sdk/deepinfra";
import { generateText, streamText, generateObject } from "ai";
import { z } from "zod";

const deepinfra = createDeepInfra({ apiKey: process.env.DEEPINFRA_TOKEN });

// Streaming
const { textStream } = streamText({
  model: deepinfra("meta-llama/Llama-3.3-70B-Instruct-Turbo"),
  prompt: "...",
});

// Structured output
const { object } = await generateObject({
  model: deepinfra("..."),
  schema: z.object({ name: z.string(), age: z.number() }),
  prompt: "...",
});
```

---

### AutoGen (Python)

```python
import autogen

config_list = [{
    "model": "meta-llama/Meta-Llama-3-70B-Instruct",
    "base_url": "https://api.deepinfra.com/v1/openai",
    "api_key": "<token>"
}]

assistant = autogen.AssistantAgent("assistant", llm_config={"config_list": config_list})
user_proxy = autogen.UserProxyAgent("user_proxy", human_input_mode="NEVER")
user_proxy.initiate_chat(assistant, message="Solve this problem...")
```

---

## Pricing

Usage-based, varies by model. Check https://deepinfra.com/pricing.

| Model type | Pricing basis |
|------------|--------------|
| LLMs / embeddings | Per 1M tokens (input + output) |
| Vision / audio models | Per execution (runtime-based) |
| Custom deployments | Per GPU-hour |

Pricing changes frequently — always verify before production use.

---

## Gotchas

1. **Model ID typos** cause 404s — verify from https://deepinfra.com/models
2. **Pricing range is wide** — Llama-3.1-8B ~$0.02/1M vs Gemini 2.5 Pro ~$1.25/1M
3. **Context windows vary** — 8K to 1M+, check before use
4. **OpenAI-compat doesn't cover everything** — vision, audio, webhooks, log probs need native API
5. **JSON mode needs prompt engineering** — model won't auto-produce valid JSON without instruction
6. **16,384 token output hard limit** — use continuation pattern for longer outputs
7. **Streaming required for log probs** — non-streaming responses don't include them
8. **Scoped JWTs expire in max 1 week** — build token refresh if using for long-lived clients

---

## Quick Reference

| Item | Value |
|------|-------|
| OpenAI-compatible base | `https://api.deepinfra.com/v1/openai` |
| Native API base | `https://api.deepinfra.com/v1/inference/{model_id}` |
| Scoped JWT endpoint | `POST https://api.deepinfra.com/v1/scoped-jwt` |
| Auth header | `Authorization: bearer $DEEPINFRA_TOKEN` |
| Rate limit | 200 concurrent requests per model |
| Max output tokens | 16,384 per request |
| Models catalog | https://deepinfra.com/models |
| Pricing | https://deepinfra.com/pricing |
| API reference | https://deepinfra.com/docs/api-reference |
| Rate limits docs | https://deepinfra.com/docs/advanced/rate-limits |
