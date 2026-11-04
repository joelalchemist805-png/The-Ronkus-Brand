export type LegacyYardageOption = {
  label: string;
  price: number;
};

export type LegacyProduct = {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string;
  image: string;
  options: {
    sizes?: string[];
    colors?: string[];
    yardage?: LegacyYardageOption[];
  };
  availability?: string;
  customization?: {
    enabled: boolean;
  };
};

export const legacyProducts: LegacyProduct[] = [
  {
    id: 'essence',
    name: 'ESSENCE',
    category: 'Footwear',
    price: 15000,
    description: 'A refined pair of slides with a clean, versatile look, designed to bring effortless style to everyday outfits.',
    image: '/assets/essence-featured.jpg',
    options: { sizes: ['36', '37', '38', '39', '40', '41', '42', '43'], colors: ['Black', 'Red', 'Pink'] },
    availability: 'Ready to Order',
  },
  {
    id: 'customized-apron',
    name: 'Customized Apron',
    category: 'Chef Aprons & Caps',
    price: 10000,
    description: 'A practical apron personalized with your chosen design or branding—ideal for cooking, baking and business use.',
    image: '/assets/aprons.jpg',
    options: { colors: ['Black', 'Red', 'Pink'] },
    customization: { enabled: true },
  },
  {
    id: 'african-print-fabrics',
    name: 'African Print Fabrics',
    category: 'Clothing & Fabrics',
    price: 3000,
    description: 'Vibrant African print fabrics with expressive patterns for creating distinctive outfits and personal styles.',
    image: '/assets/african-fabric.jpg',
    options: { yardage: [{ label: '3 yards', price: 3000 }, { label: '6 yards', price: 6000 }] },
  },
  {
    id: 'men-vintage-shirt',
    name: 'Men Vintage Shirt',
    category: 'Clothing & Fabrics',
    price: 10000,
    description: 'A statement vintage-style shirt featuring expressive prints, with other beautiful prints available.',
    image: '/assets/print-shirt.jpg',
    options: { sizes: ['S', 'M', 'L', 'XL'] },
  },
];
