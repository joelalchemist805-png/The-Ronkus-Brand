export type ContactCategory = {
  categoryName: string;
  description: string;
};

export type ContactSocialLink = {
  label: string;
  url?: string;
};

export type ContactData = {
  showRegisteredNote: boolean;
  hero: {
    eyebrow: string;
    title: string;
    tagline: string;
    whatsappButton: string;
    storyButton: string;
    registeredNote: string;
    whatsappMessage: string;
  };
  story: {
    heading: string;
    paragraphs: string[];
  };
  missionVision: {
    heading: string;
    cards: { title: string; description: string }[];
  };
  categories: {
    heading: string;
    items: ContactCategory[];
  };
  reasons: {
    heading: string;
    items: { title: string; description: string }[];
  };
  showFounder: boolean;
  founder: {
    heading: string;
    name: string;
    description: string;
    founderPhoto?: string;
  };
  contact: {
    heading: string;
    whatsappLabel: string;
    whatsappNumber: string;
    whatsappMessage: string;
    emailLabel: string;
    email: string;
    instagramLabel: string;
    instagramHandle: string;
    instagramUrl: string;
    locationLabel: string;
    location: string;
    replyNote: string;
    extraSocialsLabel: string;
    socialLinks: ContactSocialLink[];
    composerHeading: string;
    nameLabel: string;
    namePlaceholder: string;
    topicLabel: string;
    topics: string[];
    messageLabel: string;
    messagePlaceholder: string;
    submitButton: string;
    nameError: string;
    messageError: string;
    whatsappMessageGreeting: string;
    whatsappNameLabel: string;
    whatsappTopicLabel: string;
    whatsappMessageLabel: string;
  };
  finalCta: {
    heading: string;
    whatsappButton: string;
    shopButton: string;
    whatsappMessage: string;
  };
  organization: {
    name: string;
    url: string;
    logo: string;
    telephone: string;
    email: string;
    addressLocality: string;
    addressRegion: string;
    addressCountry: string;
    sameAs: string[];
  };
};

export const contactData: ContactData = {
  showRegisteredNote: true,
  hero: {
    eyebrow: 'About & Contact',
    title: 'About The Ronkus Brand',
    tagline: 'We make your outfits complete.',
    whatsappButton: 'Chat on WhatsApp',
    storyButton: 'Our Story',
    registeredNote: 'A registered Nigerian business, founded in 2017.',
    whatsappMessage: 'Hello The Ronkus Brand, I would like to know more about you.',
  },
  story: {
    heading: 'Our Story',
    paragraphs: [
      'The Ronkus Brand is more than a fashion label. We are storytellers of style, passion and cultural elegance. Founded in 2017, our mission has always been simple yet powerful: we make your outfits complete.',
      'From humble beginnings to a creative hub for luxury, casual and culture-infused fashion, we have stayed true to one thing: authentic craftsmanship. Every piece we create, from handmade unisex footwear and custom tote bags to statement clothing and accessories like bonnets, scrunchies and chef aprons, is made with purpose, precision and pride.',
      'Our red and gold brand colours speak boldly of royalty, strength and timeless beauty, and we weave them into everything we design.',
      "We don't just follow trends. And we are on a mission to help you express your identity through pieces that speak louder than words. Whether you are dressing up for a special moment or elevating your everyday style, The Ronkus Brand is here to complete your look with elegance, confidence and class.",
    ],
  },
  missionVision: {
    heading: 'Mission & Vision',
    cards: [
      {
        title: 'Our Mission',
        description: 'To make your outfits complete with timeless, classy and premium handmade pieces.',
      },
      {
        title: 'Our Vision',
        description: "To be Africa's leading brand in unisex fashion and lifestyle, blending luxury, culture and creativity.",
      },
    ],
  },
  categories: {
    heading: 'What We Make',
    items: [
      {
        categoryName: 'Footwear',
        description: 'Handcrafted sneakers, sandals, loafers, heels and more, with durable soles and tailored fits that combine comfort with luxury.',
      },
      {
        categoryName: 'Bags & Totes',
        description: 'Leather handbags, totes and carry-alls, with custom embroidery options for a personal touch.',
      },
      {
        categoryName: 'Clothing & Fabrics',
        description: 'Vintage shirts, tees, hoodies, joggers and African print fabrics that blend casual ease with cultural flair.',
      },
      {
        categoryName: 'Hair Accessories',
        description: 'Satin bonnets, scrunchies and head wraps that protect and showcase your hair.',
      },
      {
        categoryName: 'Chef Aprons & Caps',
        description: 'Durable, stylish aprons and caps for chefs, bakers and home cooks.',
      },
      {
        categoryName: 'Others',
        description: 'Wallets, bottles and bracelets to finish your look.',
      },
    ],
  },
  reasons: {
    heading: 'Why Choose The Ronkus Brand',
    items: [
      {
        title: 'Handmade Excellence',
        description: 'Every item is crafted by skilled artisans who pay close attention to detail, from stitching to finishing touches.',
      },
      {
        title: 'Tailored to You',
        description: 'Need a custom colour, personalised embroidery or a unique fit? We work with you to bring your vision to life.',
      },
      {
        title: 'Quality You Can Trust',
        description: 'We source premium leathers, durable fabrics and silk-soft satin so your purchase looks beautiful and stands the test of time.',
      },
      {
        title: 'Complete Your Look',
        description: 'Pair our signature shoes with a custom bag, or add a pop of colour with a scrunchie. We make sure every piece coordinates.',
      },
      {
        title: 'Cultural & Luxury Fusion',
        description: 'Our designs honour tradition while embracing contemporary fashion. Each product tells a story of heritage, craftsmanship and modern elegance.',
      },
    ],
  },
  showFounder: false,
  founder: {
    heading: 'Meet the Founder',
    name: 'Oluwatodimu Agunbiade',
    description: "Oluwatodimu is the founder of The Ronkus Brand, with a passion for making people's outfits complete by emphasising style, comfort and individual expression. She is committed to enhancing personal style through innovative fashion solutions.",
  },
  contact: {
    heading: 'Get in Touch',
    whatsappLabel: 'WhatsApp',
    whatsappNumber: '+234 816 030 9308',
    whatsappMessage: 'Hello The Ronkus Brand, I would like to get in touch.',
    emailLabel: 'Email',
    email: 'theronkusbrand@gmail.com',
    instagramLabel: 'Instagram',
    instagramHandle: '@the_ronkus_brand',
    instagramUrl: 'https://www.instagram.com/the_ronkus_brand',
    locationLabel: 'Location',
    location: 'Ile-Ife, Osun State, Nigeria',
    replyNote: 'Message us any time on WhatsApp. We reply as soon as we can.',
    extraSocialsLabel: 'More social links',
    socialLinks: [],
    composerHeading: 'Send us a message',
    nameLabel: 'Name',
    namePlaceholder: 'Your name',
    topicLabel: 'Topic',
    topics: ['Order enquiry', 'Custom order', 'Shoemaking Academy', 'Something else'],
    messageLabel: 'Message',
    messagePlaceholder: 'How can we help?',
    submitButton: 'Continue on WhatsApp',
    nameError: 'Please enter your name.',
    messageError: 'Please enter a message.',
    whatsappMessageGreeting: 'Hello The Ronkus Brand, I would like to get in touch.',
    whatsappNameLabel: 'Name',
    whatsappTopicLabel: 'Topic',
    whatsappMessageLabel: 'Message',
  },
  finalCta: {
    heading: "Let's complete your outfit.",
    whatsappButton: 'Chat on WhatsApp',
    shopButton: 'Browse the Shop',
    whatsappMessage: 'Hello The Ronkus Brand, help me complete my outfit.',
  },
  organization: {
    name: 'The Ronkus Brand',
    url: 'https://theronkusbrand.com.ng/',
    logo: '/assets/logo.png',
    telephone: '+2348160309308',
    email: 'theronkusbrand@gmail.com',
    addressLocality: 'Ile-Ife',
    addressRegion: 'Osun',
    addressCountry: 'NG',
    sameAs: ['https://www.instagram.com/the_ronkus_brand'],
  },
};
