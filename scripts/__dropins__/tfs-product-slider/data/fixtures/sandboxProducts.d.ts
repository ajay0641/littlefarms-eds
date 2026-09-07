import { ProductSliderItem } from '../models';

/**
 * Sample Catalog Service response shapes for Storybook.
 * Live GraphQL uses getProductSlider (SimpleProductView + ComplexProductView).
 */
export declare const sandboxProductSearchResponse: {
    productSearch: {
        total_count: number;
        items: ({
            productView: {
                sku: string;
                name: string;
                url: string;
                urlKey: string;
                inStock: boolean;
                addToCartAllowed: boolean;
                images: {
                    url: string;
                    label: string;
                    roles: string[];
                }[];
                attributes: {
                    name: string;
                    label: string;
                    value: string;
                    roles: never[];
                }[];
                price: {
                    regular: {
                        amount: {
                            value: number;
                            currency: string;
                        };
                    };
                    final: {
                        amount: {
                            value: number;
                            currency: string;
                        };
                    };
                };
                priceRange?: undefined;
            };
        } | {
            productView: {
                sku: string;
                name: string;
                url: string;
                urlKey: string;
                inStock: boolean;
                addToCartAllowed: boolean;
                images: {
                    url: string;
                    label: string;
                    roles: string[];
                }[];
                attributes: never[];
                priceRange: {
                    minimum: {
                        regular: {
                            amount: {
                                value: number;
                                currency: string;
                            };
                        };
                        final: {
                            amount: {
                                value: number;
                                currency: string;
                            };
                        };
                    };
                    maximum: {
                        regular: {
                            amount: {
                                value: number;
                                currency: string;
                            };
                        };
                        final: {
                            amount: {
                                value: number;
                                currency: string;
                            };
                        };
                    };
                };
                price?: undefined;
            };
        })[];
    };
};
/** Transformed slider items (same path as getProductSlider). */
export declare const sandboxProducts: ProductSliderItem[];
//# sourceMappingURL=sandboxProducts.d.ts.map