import dotenv from "dotenv";
dotenv.config();

export const config = {
  PORT: process.env.PORT || 8080,
};

console.log("  - PORT:", config.PORT);
