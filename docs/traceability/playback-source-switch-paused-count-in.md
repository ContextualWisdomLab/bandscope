# Playback source switch: paused count-in boundary

## Problem

`PlaybackSourceSwitchPlan` is restoration authority for one renderer-owned media-source replacement. The contract already rejected `counting-in`, because changing media while the independent count-in clock owns pending beats creates two competing timing authorities. A paused count-in was still represented as transport phase `paused` with `countInRemainingBeats > 0`, so the previous predicate could mint a restoration receipt through the generic paused path.

That receipt was ambiguous: a later transport `start` would resume the remaining count-in rather than the already-playing loop semantics assumed by ordinary paused-source continuity. Treating it as a normal paused loop would therefore allow the source-switch layer to cross the count-in timing boundary it explicitly claims not to own.

## Constraint

The source-switch helper must not become a second count-in state machine. It may preserve an armed loop, an actively looping position, or a paused-after-loop position. Count-in timing remains owned by `rehearsalTransport` and the count-in click engine.

## Executable evidence

RED commit `dd2c8e3b00602552d3b3ef68f7b1e24bd935ae1d` adds `playbackSourceSwitch.pausedCountIn.test.ts`. It constructs the reducer-representable paused-count-in state (`phase: "paused"`, pending beats remaining) and requires receipt issuance to fail closed.

Causal fix `b1208bba55871e6c04f52d12186aae3422161db7` rejects paused states unless `countInRemainingBeats === 0`. Existing paused-after-loop coverage continues to require exact position preservation, so this is a narrowing of restoration authority rather than a removal of ordinary pause continuity.

## Alternatives rejected

Resuming the pending count-in inside the source-switch module was rejected because it would duplicate count-in ownership and introduce another clock/lifecycle race. Silently converting a paused count-in into an armed or paused-after-loop state was rejected because that would fabricate transport history. Clamping or clearing the remaining beat count was rejected for the same reason.

## Effect and remaining work

A media-source change attempted during a paused count-in now burns/invalidate switch identity through the existing session machinery but cannot receive a continuity plan. The mounted player still needs the source-switch session connected to the real `audio.src`/`load()`/`loadedmetadata` lifecycle; that transaction must keep the target non-playing until exact target and decoded-duration admission, restore seek/rate only from an admitted receipt, resume only an originally looping transport, and retire the receipt on both success and failure.

This note makes no MIR-accuracy or audible-quality claim. Rights-cleared desktop audio evidence remains required for product acceptance.
