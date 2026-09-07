import { GetProductSliderOptions, ProductSliderResult } from '../../data/models';

/**
 * Fetch products for the slider via Catalog Service productSearch.
 * Defaults: phrase "", pageSize 8, currentPage 1, filter isNew=1.
 */
export declare const getProductSlider: (options?: GetProductSliderOptions) => Promise<ProductSliderResult>;
/** @deprecated Use getProductSlider — kept for earlier scaffold import paths */
export declare const productSlider: (options?: GetProductSliderOptions) => Promise<ProductSliderResult>;
//# sourceMappingURL=productSlider.d.ts.map