# Case Study: Mem0 Benchmarking & Latency Optimization

This document serves as a real-world reference for how the benchmarking methodology was applied to optimize an AI long-term memory system (Mem0).

## The Goal
The objective was to match or beat a commercial, specialized cloud API ("Supermemory", which boasted 98.4% H@1 accuracy) using entirely local, open-source models, while keeping median latency under 1000ms.

## 1. Establishing the Eval Harness
*   **The Golden Dataset:** We selected 50 real facts from the user's workspace (e.g., the actual path to the `mem0-inject` binary, or the exact location of the `.env` file).
*   **Distractor Injection:** We flooded the Qdrant vector database with 300 synthetic developer facts to create a needle-in-a-haystack environment.
*   **Deterministic Judging:** The evaluator simply checked if the exact filename string existed anywhere in the top returned results.

## 2. The Baseline & The "Corridor Problem"
*   **Baseline:** Pure vector search using `qwen3-embedding:8b-fp16` achieved **~82.3%** accuracy at **~950ms**.
*   **The Iteration:** We attempted to solve the remaining 17.7% gap by introducing **Cross-Encoder Reranking** and lowering the ANN threshold (to cast a wider net).
*   **The Corridor Problem:** While accuracy hit **100%**, latency skyrocketed to **~1650ms**. We found ourselves trapped in a corridor: any threshold strict enough to drop latency back under 1000ms caused us to miss 1 or 2 queries, breaking the 100% accuracy requirement.

## 3. Isolating the Bottleneck
By comparing *total time* vs *internal time*, we discovered the "Double 700ms Tax":
1.  **The Subprocess Tax (~700ms):** Every query spawned a new Python process, forcing a cold import of `qdrant_client`, `ollama`, and `httpx`.
2.  **The Rerank Tax (~600ms):** The cross-encoder API call itself took 600ms.

No amount of threshold tuning could solve this because the 700ms import tax was a hard floor for *all* queries.

## 4. The Architectural Pivot
Instead of fighting the threshold, we eliminated the Subprocess Tax. We transitioned the search script into a persistent **Warm Daemon** (`search_daemon.py`).

*   **The Result:** The floor dropped from 700ms to ~250ms.
*   Because the baseline was now 250ms, we could afford to run the 600ms Rerank API call on *every single query* and still hit ~850ms total.

## 5. Model Sweeping
Once the architecture was sound, we performed a sweep of embedding model sizes to save VRAM. We tested `8B`, `4B`, and `0.6B` models.
*   The `0.6B` model lost exactly 1 raw vector match compared to the `8B` model, but when paired with the "always-on" reranker, the system maintained its 100% accuracy while freeing up **7.4 GB of VRAM**.

## Final Outcome
*   **Accuracy:** 100.0%
*   **p50 Latency:** 682ms
*   **VRAM Footprint:** 639MB
*   The local open-source pipeline comprehensively beat the specialized commercial API.