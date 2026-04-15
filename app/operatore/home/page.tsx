import Link from "next/link";

export default function OperatoreHomePage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 px-4">
      <div className="mb-4 text-center">
        <h1 className="text-2xl font-bold">Cosa vuoi fare?</h1>
      </div>

      <div className="grid w-full max-w-lg gap-4 sm:grid-cols-2">
        {/* Ordini */}
        <Link
          href="/operatore/orders"
          className="group flex flex-col items-center gap-4 rounded-2xl border-2 border-gray-200 bg-white p-8 text-center shadow-sm transition-all hover:border-black hover:shadow-md"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 transition-colors group-hover:bg-black">
            <svg className="h-8 w-8 text-gray-600 transition-colors group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div>
            <div className="text-lg font-bold">Ordini</div>
            <div className="mt-1 text-sm text-gray-500">Visualizza e stampa gli ordini per cliente</div>
          </div>
        </Link>

        {/* Evasione ordini */}
        <Link
          href="/operatore/fulfillment"
          className="group flex flex-col items-center gap-4 rounded-2xl border-2 border-gray-200 bg-white p-8 text-center shadow-sm transition-all hover:border-black hover:shadow-md"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 transition-colors group-hover:bg-black">
            <svg className="h-8 w-8 text-gray-600 transition-colors group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <div className="text-lg font-bold">Evasione ordini</div>
            <div className="mt-1 text-sm text-gray-500">Prepara le casse e stampa i riepiloghi</div>
          </div>
        </Link>
      </div>
    </div>
  );
}
