import { redirect } from "next/navigation";

// Reindirizza alla home operatore con le due sezioni
export default function OperatorePage() {
  redirect("/operatore/home");
}
