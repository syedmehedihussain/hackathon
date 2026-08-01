Here's what each category is actually asking for, in plain terms:

**1. Search Quality & Relevance (30 pts) — the biggest chunk**
This asks: when someone types a vague, human query, does your system understand what they *mean*, not just match keywords? "Intent understanding" means handling queries like "cheap warm jacket" without those exact words existing in your data. "Ranking algorithm design" means the order results appear in should make sense — most relevant first, not random or just alphabetical. Practically: use embeddings/semantic search over plain keyword matching, and have a clear, explainable reason for your ranking order (similarity + maybe recency, popularity, etc — like the `rerank()` function in your boilerplate).

**2. Performance Engineering (25 pts)**
This asks: does it work fast, and does it stay fast under load? "Latency optimization" = how quickly a single search responds. "Throughput" = how many searches it can handle at once without falling over. "Efficient resource utilization" = not wasting compute/memory doing something the dumb way. Practically: caching repeated queries, indexing your database properly, and being able to state a rough number ("~200ms per search") during your demo.

**3. Deployment & Architecture (20 pts)**
This asks: is it actually live, and did you build it like a real system, not just a script on your laptop? Covers your deploy strategy (Vercel/Docker), CI/CD (your GitHub Actions), config management (env vars, not hardcoded secrets), security (not exposing API keys), and testing (even basic tests count). Practically: a working CI pipeline, a live URL, secrets in env vars not code — you already have this scaffolded.

**4. Financial & Cost Optimization (15 pts)**
This asks: are you being smart about what things cost, not just making it work at any cost? Covers API call costs (using free-tier models, caching instead of re-calling), infrastructure cost (free tiers, not paid compute), and query cost (not running expensive DB operations repeatedly). Practically: this is largely about being able to explain your choices out loud in the demo — "we use Gemini Flash's free tier and cache identical queries for 5 minutes" is a complete answer here.

**5. Observability & Resilience (10 pts)**
This asks: if something breaks, would you know? "Distributed tracing" and "monitoring dashboards" sound heavy, but at hackathon scale this means: structured logs, a health-check endpoint, maybe a simple metrics view. "Fault tolerance" means the app doesn't completely die if one API call fails — a try/catch with a sensible fallback (like the search route already has) counts.

**6. Innovation & Advanced Features (5 pts) — small, don't over-invest**
One clever, well-explained twist beats several half-built extra features. This is intentionally low-weighted, so don't burn your limited 4 hours chasing it at the expense of categories 1–3.

**7. Presentation & Documentation (5 pts) — also small, but cheap to secure**
A clear architecture diagram, a README, and a smooth 2-minute live demo. Low point value, but also low effort relative to payoff — Rahin's track covers this almost entirely in parallel with your build, so it shouldn't cost you build time.

**The strategic read:** categories 1+2+3 are 75 of the 100 points. If time runs short, that's where you protect effort — search/ranking quality, speed, and having it actually deployed with clean CI. Cost, observability, innovation, and docs are real points but forgiving ones, and mostly things you can bolt on in the last 30-45 minutes or hand off to Joy/Rahin in parallel.
