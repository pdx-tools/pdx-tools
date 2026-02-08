import { defineConfig } from "vite";
import react from '@vitejs/plugin-react'
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
    plugins: [tailwindcss(), react()],
    resolve: {
        alias: {
            "@/components": path.resolve(__dirname, "../app/app/components"),
            "@/lib": path.resolve(__dirname, "../app/app/lib"),
        },
    },
});
