# Expanded-image offline quality gate

The formal six-type pipeline may replace the old formal generation path only after a saved, fresh offline report passes every gate. This is a direct activation gate: it is not a shadow run, percentage rollout, or dual-write comparison.

## Fixed dataset and annotation

`worker/samples/expanded-image-quality-samples.json` is the immutable 60-sample set. It contains exactly ten uniquely identified, evidence-backed samples for each canonical primary type: `environment`, `portrait`, `interaction`, `action`, `object`, and `atmosphere`.

Annotators label only the expected primary type from the cited source text and expected composition. They must not infer unsupported visual facts, add style labels as a primary type, or alter a label after reviewing a model result. A change to the samples, annotation guidance, prompt, contract, model, or audit version requires a new result snapshot and report; it does not amend an existing activation decision.

## Blind type review

For blind review, the reviewer receives the generated image and the six canonical type definitions, but not the source label, model prediction, prompt, contract type, audit outcome, or other reviewers' choices. Record that independent choice as `blindPrimaryType` in the results snapshot. Reconcile disagreements only after all blind choices are locked; retain the raw reviewer evidence outside the production callback path.

## Run the gate

From `worker/`, use Python 3.13 and local input/output paths only:

```powershell
$env:PYTHONPATH = 'src'
& 'C:\Users\18270\AppData\Local\Programs\Python\Python313\python.exe' scripts/run_expanded_image_quality_check.py `
  --samples samples/expanded-image-quality-samples.json `
  --results path/to/fresh-results.json `
  --output .tmp/expanded-image-quality-report.json
```

The command writes JSON and a same-named Markdown file. It intentionally does not accept `--api-url`, imports no Server/Supabase transport, and never invokes Worker callbacks. Do not add callback wiring to this command.

`expanded-image-quality-results.example.json` is a schema/rendering fixture only, deliberately marked `example-fixture-not-activation-evidence`. Its result rows include failure fields and produce a failed gate, so it cannot be used as activation evidence.

## Interpret the report

All four comparisons are inclusive at the specified boundary:

| Metric | Required |
| --- | ---: |
| `classificationAccuracy` | at least 80% |
| `compositionCompliance` | at least 85% |
| `severeFactConflictRate` | at most 5% |
| `blindTypeRecognitionRate` | at least 75% |

`passed: true` means all comparisons passed. `failedGates` identifies the blocking metric, while `failedSampleIds` and `failures` identify the deterministic, canonical-type-then-ID sorted samples to investigate. `versions` lists every model, prompt, contract, and audit version observed in the snapshot. A mixed-version report may be inspected, but its versions must be reviewed before relying on it for a release decision.

## Direct activation decision

Activate the formal new pipeline only when a non-example report is freshly produced from the fixed 60 samples, is saved with its JSON and Markdown counterpart, has `passed: true`, and all recorded versions are approved for the release. Any failed gate forbids activation. Do not bypass a failure by changing a threshold, removing samples, fabricating blind labels, or retaining the old and new formal paths in parallel.
