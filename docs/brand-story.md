# BandScope Brand Story

## One-line definition

BandScope is an easy band mate that turns complex rehearsal analysis into something people can use right away for practice, copying, and rehearsal prep after work, while still aiming for high analysis accuracy.
It should help with what to play, when to enter, how the section moves, what to simplify, and what each player needs to lock in before rehearsal.

## Brand story

BandScope is not a professional music analyzer.
BandScope exists for people who finish work, head to rehearsal, and do not have enough time.

Its starting point is not studio prestige or advanced theory.
Its starting point is the time people lose before they can actually play.

Band hobbyists with day jobs often face the same problem.
They want to understand the original song before rehearsal, but separating parts, understanding the harmonic flow for each instrument, and checking vocal or instrument range takes too long.
As a result, rehearsal time gets spent on confusion instead of music.

BandScope exists to reduce that waste.

Users should be able to drop in a YouTube link or audio file, see a practical rehearsal view of the song, inspect likely harmony by section and by playing role, listen to separated parts, understand each part's range, and spot where parts clash or need simplification.
They should also be able to follow the form quickly, understand tempo and groove cues, see who enters or drops out, and identify which sections need attention first.

That means BandScope cannot treat `the chord` as one flat answer for the whole arrangement.
Different keyboard players, each left hand, each right hand, the bass guitar, guitars, horns, strings, lead vocals, backing vocals, or other arrangement-carrying roles can hold different note choices or harmonic functions at the same moment.
BandScope should treat those roles as separate extraction targets.
If the arrangement exposes separate left/right hands, multiple keyboard players, bass movement, lead-vocal melody, or backing-vocal harmony, the product should aim to extract and present them separately enough that rehearsal decisions can be made per player and per role, not only at the song-summary level.

BandScope does not try to replace musical judgment.
It helps people understand songs faster and rehearse better.

BandScope should never sound like a strict teacher or an authority handing down the right answer.
It should feel like a practical band mate that organizes the hard parts so rehearsal can start sooner.

## Name meaning

BandScope combines `Band` and `Scope`.

- `Band` means the product is built for rehearsal and group playing, not solo analysis for its own sake.
- `Scope` means better visibility into the song, the part ranges, and the whole band sound.

## Brand promise

BandScope turns complex music analysis into something office-worker band hobbyists can use right away in practice, without giving up the level of accuracy they need to trust the result.

One-line promise:

`귀로만 버티던 카피를, 눈으로 정리해 합주 시간을 음악에 더 쓰게 한다.`

## Core value

### 1. Reduce confusion

Turn first-listen uncertainty into understandable information.

- `아, 이 곡은 악기마다 이렇게 잡아야 하는구나`
- `여기서는 리드 보컬이 이 음역이네`
- `이 코러스는 백보컬 화성이 이렇게 쌓이네`
- `여기 기타랑 키보드가 겹치네`

### 2. Save rehearsal time

Reduce ear-only copying time and help users spend more time actually playing.
That includes fast transposition choices, capo or tuning-aware playability hints, lyric or count-based cue anchors, and a clear view of what each player needs to fix before the room starts.

### 3. Show the form and feel, not just the harmony

Help players see where the song changes, how sections connect, where hits or stops matter, what kind of rhythmic feel they need to lock together, and where entries, dropouts, pickups, and handoffs happen.

### 4. Prioritize action over theory, not over accuracy

Show results that help practice now before offering deeper explanation, but do not simplify the product in ways that make the analysis meaningfully less accurate.

### 5. Help like a peer, not a judge

Be smart, but never show off.
Be kind, clear, and useful.

### 6. Tell each player what matters first

Make it obvious which role carries the hook, which part can simplify, which cue matters, which section is most likely to waste rehearsal time, and what each player should learn first versus confirm in the room.

## Brand personality

### Keep

- friendly
- practical
- clear
- non-authoritative
- musically engaged without showing off
- fast-result oriented
- beginner-safe
- solid enough for experienced players

### Avoid

- overly academic language
- DAW or studio-engineering posturing
- authority-driven `this is the answer` tone
- teacher-like explanations that feel like a test
- long theory lectures when a short practical answer would do

## Voice guidelines

### 1. Use everyday music language

Prefer simpler phrasing when it communicates the same thing.

- `harmonic content` -> `화성 성분`
- `segment merge` -> `구간 합치기`
- `low confidence` -> `확실하지 않음`

### 2. Show the use first

Lead with what the user can do with the result.

Good:
- `이 기능은 코러스에서 보컬과 키보드가 겹치는 구간을 빨리 찾게 해줍니다.`

### 3. Do not overclaim

Frame analysis as recommendation or estimation.

Good:
- `자동으로 추정한 코드입니다.`
- `가장 가능성이 높은 파트 분류입니다.`
- `이 구간은 확신이 낮으니 귀로 한 번 더 확인해 보세요.`

### 4. Sound like a band mate

Guide users like a peer helping with rehearsal prep, not a teacher delivering a lesson.

### 5. Stay in rehearsal context

Tie feature explanations back to practice, copying, rehearsal prep, or quick understanding.

## UX principles

- keep the first screen simple
- keep the path to first analysis short
- show results fast
- hide complex options behind reasonable defaults without lowering result quality
- keep automatic analysis editable
- avoid making users feel like they are learning a DAW
- keep practice-first tasks in front: harmonic view by section and playing role, section roadmap, tempo/groove cues, vocal and instrument range view, loop playback, overlap/clash cues, simplification cues, transposition and capo/tuning guidance, confidence flags, and role-specific editing
- make sharing results easy

## Decision rules for future docs and copy

- If one option is more powerful but more complex, prefer the one that helps practice sooner without reducing the accuracy users need for rehearsal decisions.
- Do not collapse arrangement-specific harmony into one global chord label when the real rehearsal problem is instrument-, hand-, vocal-, or role-specific voicing or function.
- Do not collapse rehearsal prep into chord display when structure, timing, transposition, or player coordination are the real blockers.
- If a player needs a practical output like a cue sheet, compact chart, or lyric-linked rehearsal anchor, prefer that over deeper analysis that still leaves them guessing when to come in.
- If one sentence sounds more professional but colder, prefer the one that sounds practical and kind.
- If one screen shows more information but feels heavier, prefer the simpler default mode as long as it does not hide or weaken important accurate feedback.
- Never present uncertain output like a final answer.
- Judge every feature and every sentence by one question: `Does this help people rehearse better, sooner?`

## Accuracy principle

- easy to use does not mean accuracy can be loose
- fast results should still be reliable enough for real rehearsal prep
- product simplification should remove friction, not lower analytical correctness
- if there is a trade-off, aim to keep both: low learning cost and high confidence in the result
- uncertainty should be visible at the section and role level when it can change rehearsal decisions

## Required application areas

Apply this brand story in:

- naming and positioning
- home screen copy
- upload and import copy
- onboarding
- error messages
- feature descriptions
- PRD and TRD writing
- UX structure and prioritization
- marketing copy
- FAQ
- empty states
- export labels and guidance
- user guides
- rehearsal cue sheets and chart-style exports

## Copy patterns

### Good examples

- `이 구간은 보컬과 키보드가 같은 음역에 몰려 있어 답답하게 들릴 수 있습니다.`
- `자동으로 추정한 악기별·보컬별 코드와 화성 흐름입니다. 필요하면 직접 고칠 수 있습니다.`
- `이 구간은 드럼과 베이스가 같이 잠깐 멈추는 타이밍이 중요합니다.`
- `오늘 합주 기준으로는 이 보이싱을 단순하게 줄여도 됩니다.`
- `이 파트는 2절에서만 들어오고, 코러스 직전 가사 뒤에서 다시 잡으면 됩니다.`
- `기타는 카포 2 기준으로 보면 오늘 합주 준비가 더 쉽습니다.`
- `어려운 구간만 반복해서 들으면서 코드를 확인해 보세요.`

### Bad examples

- `본 시스템은 다중 스템 분리 기반의 하모닉-퍼커시브 구조 분석을 수행합니다.`
- `해당 결과는 모델의 추론적 확률 분포에 의해 산출되었습니다.`
- `사용자는 세그먼트 단위 후처리를 통해 정정할 수 있습니다.`

## Fast reference

BandScope is:

`퇴근 후 합주하는 사람들을 위해, 악기와 보컬 역할별 코드·폼·리듬·음역·충돌·준비 우선순위를 한눈에 정리해 바로 연습에 쓸 수 있게 돕는 밴드 메이트`

Use this line as the default tie-breaker for future product, UX, and copy decisions.
