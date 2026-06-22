🎯 **What:** `bandscope_analysis.roles.tuning` 모듈의 `get_setup_note` 함수에 대한 단위 테스트가 없던 문제(실질적으로 `detect_capo_and_tuning`에 의존적인 통합 테스트로만 동작하던 문제)를 해결했습니다. `unittest.mock.patch`를 이용해 외부 의존성을 완벽히 격리한 단위 테스트 케이스 4개를 추가했습니다.

📊 **Coverage:** 다음 시나리오들에 대한 문자열 생성(formatting) 로직을 검증합니다:
* 커스텀 튜닝과 카포가 모두 감지된 경우 (e.g., Open G tuning, Capo 2)
* 커스텀 튜닝만 감지되고 카포는 없는 경우 (e.g., Eb tuning)
* 표준 튜닝에 카포만 감지된 경우 (e.g., Standard tuning, Capo 4)
* 표준 튜닝에 카포도 감지되지 않은 경우 (`None` 반환 검증)

✨ **Result:** `get_setup_note` 함수의 순수 문자열 생성 로직에 대한 테스트 커버리지가 향상되었으며, 외부 함수(`detect_capo_and_tuning`)에 대한 의존성 없이 독립적으로 `100%`의 분기 커버리지(Branch Coverage)를 달성 및 유지하게 되었습니다.
