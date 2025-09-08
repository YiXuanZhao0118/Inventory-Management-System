"use client";

import LoanForm from "@/features/LongTermRentedPage";
import ReturnPage from "@/features/LongTermReturnPage";

export default function LoanAndReturnPage() {
  return (
    <div className="">
      <section className="">
        <LoanForm />
      </section>
      <h1 className="h-3"></h1>
      <section className="">
        <ReturnPage />
      </section>
    </div>
  );
}
