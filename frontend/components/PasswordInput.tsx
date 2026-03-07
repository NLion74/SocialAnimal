"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import s from "./PasswordInput.module.css";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export default function PasswordInput({ className, ...props }: Readonly<PasswordInputProps>) {
    const [showPassword, setShowPassword] = useState(false);

    return (
        <div className={s.wrapper}>
            <input
                {...props}
                type={showPassword ? "text" : "password"}
                className={[className, s.input].filter(Boolean).join(" ")}
            />
            <button
                type="button"
                className={s.toggle}
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
            >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
        </div>
    );
}
