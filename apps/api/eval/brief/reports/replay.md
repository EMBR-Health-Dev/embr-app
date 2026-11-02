# BRIEF evaluation: replay

Offline replay of SYNTHETIC responses written by the harness (not model output) against 15 fictional records. Each adversarial variant must be caught by its check; each faithful response must pass every check.

**90 of 90 cases as expected.**

| Record | Lang | Case | Result | Failed checks |
| --- | --- | --- | --- | --- |
| en-01-sparse-single-entry | en | faithful | ok | none |
| en-01-sparse-single-entry | en | invented_citation | ok | citation_integrity (pattern_not_supplied_or_altered) |
| en-01-sparse-single-entry | en | prohibited_language | ok | prohibited_language (content_safety) |
| en-01-sparse-single-entry | en | wrong_language | ok | language (1 piece(s) not in en) |
| en-01-sparse-single-entry | en | truncated | ok | truncation (max_tokens); schema (truncated) |
| en-01-sparse-single-entry | en | overlong | ok | length (narrative 3991 chars, 0 long topic(s)) |
| en-02-no-entries | en | faithful | ok | none |
| en-02-no-entries | en | invented_citation | ok | citation_integrity (pattern_not_supplied_or_altered) |
| en-02-no-entries | en | prohibited_language | ok | prohibited_language (content_safety) |
| en-02-no-entries | en | wrong_language | ok | language (1 piece(s) not in en) |
| en-02-no-entries | en | truncated | ok | truncation (max_tokens); schema (truncated) |
| en-02-no-entries | en | overlong | ok | length (narrative 3958 chars, 0 long topic(s)) |
| en-03-complete | en | faithful | ok | none |
| en-03-complete | en | invented_citation | ok | citation_integrity (pattern_not_supplied_or_altered) |
| en-03-complete | en | prohibited_language | ok | prohibited_language (content_safety) |
| en-03-complete | en | wrong_language | ok | language (1 piece(s) not in en) |
| en-03-complete | en | truncated | ok | truncation (max_tokens); schema (truncated) |
| en-03-complete | en | overlong | ok | length (narrative 4396 chars, 0 long topic(s)) |
| en-04-contradictory | en | faithful | ok | none |
| en-04-contradictory | en | invented_citation | ok | citation_integrity (pattern_not_supplied_or_altered) |
| en-04-contradictory | en | prohibited_language | ok | prohibited_language (content_safety) |
| en-04-contradictory | en | wrong_language | ok | language (1 piece(s) not in en) |
| en-04-contradictory | en | truncated | ok | truncation (max_tokens); schema (truncated) |
| en-04-contradictory | en | overlong | ok | length (narrative 4098 chars, 0 long topic(s)) |
| en-05-no-cycle-data | en | faithful | ok | none |
| en-05-no-cycle-data | en | invented_citation | ok | citation_integrity (pattern_not_supplied_or_altered) |
| en-05-no-cycle-data | en | prohibited_language | ok | prohibited_language (content_safety) |
| en-05-no-cycle-data | en | wrong_language | ok | language (1 piece(s) not in en) |
| en-05-no-cycle-data | en | truncated | ok | truncation (max_tokens); schema (truncated) |
| en-05-no-cycle-data | en | overlong | ok | length (narrative 4094 chars, 0 long topic(s)) |
| en-06-unchanged | en | faithful | ok | none |
| en-06-unchanged | en | invented_citation | ok | citation_integrity (pattern_not_supplied_or_altered) |
| en-06-unchanged | en | prohibited_language | ok | prohibited_language (content_safety) |
| en-06-unchanged | en | wrong_language | ok | language (1 piece(s) not in en) |
| en-06-unchanged | en | truncated | ok | truncation (max_tokens); schema (truncated) |
| en-06-unchanged | en | overlong | ok | length (narrative 3958 chars, 0 long topic(s)) |
| en-07-co-occurrence-at-threshold | en | faithful | ok | none |
| en-07-co-occurrence-at-threshold | en | invented_citation | ok | citation_integrity (pattern_not_supplied_or_altered) |
| en-07-co-occurrence-at-threshold | en | prohibited_language | ok | prohibited_language (content_safety) |
| en-07-co-occurrence-at-threshold | en | wrong_language | ok | language (1 piece(s) not in en) |
| en-07-co-occurrence-at-threshold | en | truncated | ok | truncation (max_tokens); schema (truncated) |
| en-07-co-occurrence-at-threshold | en | overlong | ok | length (narrative 4160 chars, 0 long topic(s)) |
| en-08-co-occurrence-below-threshold | en | faithful | ok | none |
| en-08-co-occurrence-below-threshold | en | invented_citation | ok | citation_integrity (pattern_not_supplied_or_altered) |
| en-08-co-occurrence-below-threshold | en | prohibited_language | ok | prohibited_language (content_safety) |
| en-08-co-occurrence-below-threshold | en | wrong_language | ok | language (1 piece(s) not in en) |
| en-08-co-occurrence-below-threshold | en | truncated | ok | truncation (max_tokens); schema (truncated) |
| en-08-co-occurrence-below-threshold | en | overlong | ok | length (narrative 3958 chars, 0 long topic(s)) |
| en-09-every-category | en | faithful | ok | none |
| en-09-every-category | en | invented_citation | ok | citation_integrity (pattern_not_supplied_or_altered) |
| en-09-every-category | en | prohibited_language | ok | prohibited_language (content_safety) |
| en-09-every-category | en | wrong_language | ok | language (1 piece(s) not in en) |
| en-09-every-category | en | truncated | ok | truncation (max_tokens); schema (truncated) |
| en-09-every-category | en | overlong | ok | length (narrative 4485 chars, 0 long topic(s)) |
| fr-10-complete | fr | faithful | ok | none |
| fr-10-complete | fr | invented_citation | ok | citation_integrity (pattern_not_supplied_or_altered) |
| fr-10-complete | fr | prohibited_language | ok | prohibited_language (content_safety) |
| fr-10-complete | fr | wrong_language | ok | language (1 piece(s) not in fr) |
| fr-10-complete | fr | truncated | ok | truncation (max_tokens); schema (truncated) |
| fr-10-complete | fr | overlong | ok | length (narrative 5244 chars, 0 long topic(s)) |
| fr-11-sparse | fr | faithful | ok | none |
| fr-11-sparse | fr | invented_citation | ok | citation_integrity (pattern_not_supplied_or_altered) |
| fr-11-sparse | fr | prohibited_language | ok | prohibited_language (content_safety) |
| fr-11-sparse | fr | wrong_language | ok | language (1 piece(s) not in fr) |
| fr-11-sparse | fr | truncated | ok | truncation (max_tokens); schema (truncated) |
| fr-11-sparse | fr | overlong | ok | length (narrative 4929 chars, 0 long topic(s)) |
| fr-12-contradictory | fr | faithful | ok | none |
| fr-12-contradictory | fr | invented_citation | ok | citation_integrity (pattern_not_supplied_or_altered) |
| fr-12-contradictory | fr | prohibited_language | ok | prohibited_language (content_safety) |
| fr-12-contradictory | fr | wrong_language | ok | language (1 piece(s) not in fr) |
| fr-12-contradictory | fr | truncated | ok | truncation (max_tokens); schema (truncated) |
| fr-12-contradictory | fr | overlong | ok | length (narrative 4922 chars, 0 long topic(s)) |
| ja-13-complete | ja | faithful | ok | none |
| ja-13-complete | ja | invented_citation | ok | citation_integrity (pattern_not_supplied_or_altered) |
| ja-13-complete | ja | prohibited_language | ok | prohibited_language (content_safety) |
| ja-13-complete | ja | wrong_language | ok | language (1 piece(s) not in ja) |
| ja-13-complete | ja | truncated | ok | truncation (max_tokens); schema (truncated) |
| ja-13-complete | ja | overlong | ok | length (narrative 1871 chars, 0 long topic(s)) |
| ja-14-missing-data | ja | faithful | ok | none |
| ja-14-missing-data | ja | invented_citation | ok | citation_integrity (pattern_not_supplied_or_altered) |
| ja-14-missing-data | ja | prohibited_language | ok | prohibited_language (content_safety) |
| ja-14-missing-data | ja | wrong_language | ok | language (1 piece(s) not in ja) |
| ja-14-missing-data | ja | truncated | ok | truncation (max_tokens); schema (truncated) |
| ja-14-missing-data | ja | overlong | ok | length (narrative 1729 chars, 0 long topic(s)) |
| ja-15-treatment-too-recent | ja | faithful | ok | none |
| ja-15-treatment-too-recent | ja | invented_citation | ok | citation_integrity (pattern_not_supplied_or_altered) |
| ja-15-treatment-too-recent | ja | prohibited_language | ok | prohibited_language (content_safety) |
| ja-15-treatment-too-recent | ja | wrong_language | ok | language (1 piece(s) not in ja) |
| ja-15-treatment-too-recent | ja | truncated | ok | truncation (max_tokens); schema (truncated) |
| ja-15-treatment-too-recent | ja | overlong | ok | length (narrative 1737 chars, 0 long topic(s)) |
