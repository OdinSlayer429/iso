#!/usr/bin/env python3
"""
Generates synthetic loan-decision batches for the ZK fairness proof demo.

Schema (one row per applicant):
  applicant_id   int
  income         annual income, USD
  credit_score   300-850
  group          "A" or "B" -- protected-class proxy attribute
  approved       0 or 1

Two batches are produced:
  fair_batch.csv    - approval depends only on income/credit_score; group is irrelevant
  biased_batch.csv  - same underlying applicants, but group B is penalized,
                      producing a demographic parity gap above the 10% threshold
"""
import csv
import random

random.seed(42)
N = 500


def make_applicants(n):
    rows = []
    for i in range(n):
        income = int(random.gauss(65000, 25000))
        income = max(15000, income)
        credit_score = int(random.gauss(680, 80))
        credit_score = min(850, max(300, credit_score))
        group = "A" if i % 2 == 0 else "B"
        rows.append({"applicant_id": i, "income": income, "credit_score": credit_score, "group": group})
    return rows


def score(row):
    # simple underwriting score: higher income/credit_score -> more likely approved
    return (row["income"] / 100000) * 0.5 + (row["credit_score"] / 850) * 0.5


def fair_decision(row):
    s = score(row)
    return 1 if s > 0.55 else 0


def biased_decision(row):
    s = score(row)
    if row["group"] == "B":
        s -= 0.20  # penalize group B regardless of qualification
    return 1 if s > 0.55 else 0


def write_csv(path, rows, decision_fn):
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["applicant_id", "income", "credit_score", "group", "approved"])
        w.writeheader()
        for row in rows:
            out = dict(row)
            out["approved"] = decision_fn(row)
            w.writerow(out)


def demographic_parity_gap(path):
    approved = {"A": [0, 0], "B": [0, 0]}  # [approved_count, total_count]
    with open(path) as f:
        for row in csv.DictReader(f):
            g = row["group"]
            approved[g][1] += 1
            if row["approved"] == "1":
                approved[g][0] += 1
    rate_a = approved["A"][0] / approved["A"][1]
    rate_b = approved["B"][0] / approved["B"][1]
    return abs(rate_a - rate_b), rate_a, rate_b


if __name__ == "__main__":
    applicants = make_applicants(N)
    write_csv("fair_batch.csv", applicants, fair_decision)
    write_csv("biased_batch.csv", applicants, biased_decision)

    for name in ("fair_batch.csv", "biased_batch.csv"):
        gap, rate_a, rate_b = demographic_parity_gap(name)
        print(f"{name}: P(approve|A)={rate_a:.3f} P(approve|B)={rate_b:.3f} gap={gap:.3f}")
