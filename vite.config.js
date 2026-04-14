import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Replace 'nba-bracket-challenge' with your actual GitHub repo name
export default defineConfig({
  plugins: [react()],
  base: "/nba-bracket-challenge/",
});
