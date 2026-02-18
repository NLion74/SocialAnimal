"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function getEnv(key, defaultValue) {
    const value = process.env[key] || defaultValue;
    if (!value) {
        throw new Error(`Missing environment variable: ${key}`);
    }
    return value;
}
exports.env = {
    DATABASE_URL: getEnv("DATABASE_URL"),
    JWT_SECRET: getEnv("JWT_SECRET"),
    PORT: parseInt(getEnv("PORT", "3000"), 10),
    NODE_ENV: getEnv("NODE_ENV", "development"),
};
