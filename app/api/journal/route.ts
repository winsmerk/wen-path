import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
function retired(){return NextResponse.json({error:"此入口已停用，请使用独立记录、生词表或自媒体模块。"},{status:410});}
export const GET=retired;
export const POST=retired;
export const DELETE=retired;
