import { NextResponse } from "next/server";

export async function GET() {
    return NextResponse.json({
        API_URL: process.env.BACKEND_URL || "",
        ICS_BASE_URL: process.env.PUBLIC_URL || "http://localhost:3000",
    });
}
