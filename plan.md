1. **Optimize `.filter().map()` in `apps/desktop/src/features/workspace/SectionRoadmap.tsx`**
   - The current code uses `section.roles.filter(...).map(...)` inside a render function. This chains array methods, creating an intermediate array after `filter` which must be garbage collected, introducing unnecessary GC overhead inside a frequently re-rendered UI component.
   - Replace this with a single `.reduce()` step or a traditional `for...of` loop to directly accumulate the nodes that meet the criteria, avoiding the intermediate array allocation.
   - Wait, `reduce` is already called out in `.jules/bolt.md` to be avoided in some contexts but `.filter().map()` intermediate arrays are explicitly warned against. The instruction is: "To optimize React render functions and avoid intermediate array allocations, avoid chaining `.filter().map()`. Instead, use a single `.reduce()` pass or a loop to conditionally accumulate nodes."
2. **Pre-commit checks**
   - Run `npm run test --workspace=@bandscope/desktop` to ensure that this optimization does not break any tests.
   - Run `npm run lint` or `npm run check`.
3. **Submit PR**
   - Provide a PR description following Bolt's specific requirements.
   - Add journal entry to `.jules/bolt.md` documenting this finding.
