import { NextRequest, NextResponse } from "next/server";
import { requireApiActor } from "@/lib/auth/api-session";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { sendSupportEmail } from "@/lib/email/send";

export async function POST(request: NextRequest) {
  try {
    const { actor, session, errorResponse } = await requireApiActor(request);
    if (errorResponse) return errorResponse;

    const { subject, message } = await request.json();

    if (!subject || !message) {
      return NextResponse.json({ error: "Assunto e mensagem são obrigatórios" }, { status: 400 });
    }

    // Obter nome da igreja
    const supabase = getFirebaseAdminClient();
    const { data: church } = await supabase
      .from("churches")
      .select("name")
      .eq("id", session.church_id)
      .single();

    const churchName = church?.name || "Igreja";

    // Enviar email para o suporte (usar email do admin ou hardcoded)
    const supportEmail = process.env.SUPPORT_EMAIL || "suporte@seudominio.com";

    await sendSupportEmail({
      to: supportEmail,
      userName: session.name,
      churchName,
      userEmail: session.email,
      subject,
      message,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao enviar mensagem de suporte:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}