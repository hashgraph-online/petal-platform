import defaultTheme from "tailwindcss/defaultTheme";

const config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./app/**/*.{jsx,tsx,html}",
    "./components/**/*.{jsx,tsx,html}",
    "./providers/**/*.{jsx,tsx,html}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Roboto"', ...defaultTheme.fontFamily.sans],
        mono: ['"Roboto Mono"', ...defaultTheme.fontFamily.mono],
        jakarta: ['"Plus Jakarta Sans"', ...defaultTheme.fontFamily.sans],
        styrene: ['"Styrene A"', ...defaultTheme.fontFamily.sans],
      },
      borderRadius: {
        sm: "4px",
      },
      colors: {
        brand: {
          white: "#ffffff",
          dark: "#3f4174",
          blue: "#5599fe",
          green: "#48df7b",
          purple: "#b56cff",
        },
        holNavy: "#dfe5ff",
        holBlue: "#6aa9ff",
        holPurple: "#c3a4ff",
        holGreen: "#76f5aa",
        blue: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#5599fe",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
        },
        hedera: {
          purple: "#8259ef",
          blue: "#2d84eb",
          green: "#3ec878",
          charcoal: "#464646",
          smoke: "#8c8c8c",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        "pulse-slow": "pulse 4s ease-in-out infinite",
        blink: "blink 1s step-end infinite",
        "fade-in": "fadeIn 0.5s ease-in forwards",
        draw: "draw 2s forwards",
        "data-flow": "dataFlow 15s linear infinite",
        blob: "blob 7s infinite",
        shine: "shine 3s linear infinite",
        shimmer: "shimmer 2s linear infinite",
        "slide-up": "slideUp 0.3s ease-out",
        "slide-down": "slideDown 0.3s ease-out",
        "scale-in": "scaleIn 0.2s ease-out",
        "rotate-3d": "rotate3d 8s linear infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-20px)" },
        },
        blink: {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0 },
        },
        fadeIn: {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 },
        },
        draw: {
          "0%": { strokeDashoffset: "1000" },
          "100%": { strokeDashoffset: "0" },
        },
        dataFlow: {
          "0%": { transform: "translateY(-50%)" },
          "100%": { transform: "translateY(0%)" },
        },
        blob: {
          "0%": { transform: "translate(0px, 0px) scale(1)" },
          "33%": { transform: "translate(30px, -50px) scale(1.1)" },
          "66%": { transform: "translate(-20px, 20px) scale(0.9)" },
          "100%": { transform: "translate(0px, 0px) scale(1)" },
        },
        shine: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-100% 0" },
          "100%": { backgroundPosition: "100% 0" },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideDown: {
          "0%": { transform: "translateY(-10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        scaleIn: {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        rotate3d: {
          "0%": { transform: "rotateX(0deg) rotateY(0deg)" },
          "25%": { transform: "rotateX(90deg) rotateY(0deg)" },
          "50%": { transform: "rotateX(90deg) rotateY(90deg)" },
          "75%": { transform: "rotateX(0deg) rotateY(90deg)" },
          "100%": { transform: "rotateX(0deg) rotateY(0deg)" },
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "hedera-gradient":
          "linear-gradient(135deg, #8259ef 0%, #2d84eb 100%)",
        "hedera-green-gradient":
          "linear-gradient(135deg, #3ec878 0%, #2d84eb 100%)",
        "brand-gradient":
          "linear-gradient(135deg, #5599fe 0%, #b56cff 50%, #48df7b 100%)",
      },
      boxShadow: {
        "brand-blue": "0 4px 14px 0 rgba(85, 153, 254, 0.39)",
        "brand-purple": "0 4px 14px 0 rgba(181, 108, 255, 0.39)",
        "brand-green": "0 4px 14px 0 rgba(72, 223, 123, 0.39)",
        "glow-blue": "0 0 20px rgba(85, 153, 254, 0.3)",
        "glow-purple": "0 0 20px rgba(181, 108, 255, 0.3)",
        "glow-green": "0 0 20px rgba(72, 223, 123, 0.3)",
        "glow-orange": "0 0 20px rgba(249, 115, 22, 0.5)",
        "glow-pink": "0 0 20px rgba(236, 72, 153, 0.5)",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};

export default config;
