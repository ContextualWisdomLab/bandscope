# Product Readiness References

This bibliography supports the BandScope 1.0 product-readiness baseline and related issues. Citations use APA 7th style where the source provides sufficient publication metadata. Product documentation pages are cited as organizational web resources and must be rechecked when their upstream version changes.

## Desktop distribution and update

Apple Inc. (n.d.). *Notarizing macOS software before distribution*. Apple Developer Documentation. https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution

Microsoft. (n.d.). *Sign an app package using SignTool*. Microsoft Learn. https://learn.microsoft.com/windows/msix/package/sign-app-package-using-signtool

Tauri Contributors. (n.d.). *Application signing*. Tauri. https://v2.tauri.app/distribute/sign/

Tauri Contributors. (n.d.). *Updater plugin*. Tauri. https://v2.tauri.app/plugin/updater/

## Accessibility and executable design evidence

Storybook Contributors. (n.d.). *Accessibility testing*. Storybook. https://storybook.js.org/docs/writing-tests/accessibility-testing

World Wide Web Consortium. (2023). *Web Content Accessibility Guidelines (WCAG) 2.2*. https://www.w3.org/TR/WCAG22/

World Wide Web Consortium. (2023). *Accessible Rich Internet Applications (WAI-ARIA) 1.2*. https://www.w3.org/TR/wai-aria-1.2/

## Music-information-retrieval evaluation

Bittner, R. M., Salamon, J., Tierney, M., Mauch, M., Cannam, C., & Bello, J. P. (2014). MedleyDB: A multitrack dataset for annotation-intensive MIR research. In *Proceedings of the 15th International Society for Music Information Retrieval Conference* (pp. 155–160). https://medleydb.weebly.com/

MIREX. (n.d.). *Audio chord estimation*. Music Information Retrieval Evaluation eXchange. https://www.music-ir.org/mirex/wiki/2024:Audio_Chord_Estimation

Raffel, C., McFee, B., Humphrey, E. J., Salamon, J., Nieto, O., Liang, D., & Ellis, D. P. W. (2014). mir_eval: A transparent implementation of common MIR metrics. In *Proceedings of the 15th International Society for Music Information Retrieval Conference* (pp. 367–372). https://craffel.github.io/mir_eval/

Rafii, Z., Liutkus, A., Stöter, F.-R., Mimilakis, S. I., & Bittner, R. (2019). MUSDB18-HQ—An uncompressed version of MUSDB18. *Zenodo*. https://doi.org/10.5281/zenodo.3338373

Stöter, F.-R., Liutkus, A., & Ito, N. (2018). The 2018 Signal Separation Evaluation Campaign. In E. Vincent, A. Yeredor, Z. Koldovský, & P. Tichavský (Eds.), *Latent Variable Analysis and Signal Separation* (pp. 293–305). Springer. https://doi.org/10.1007/978-3-319-93764-9_28

## Use in BandScope

These sources do not by themselves prove BandScope conformance or accuracy. Each cited requirement must map to:

```text
source requirement or evaluation method
→ BandScope product decision
→ owning issue and implementation
→ exact fixture and rights evidence
→ current-head test/build/release evidence
→ known limitation and supported claim
```

Official certification, notarization, code-signing, conformance, or benchmark claims may be made only after the corresponding external process and exact release artifact have been verified.
