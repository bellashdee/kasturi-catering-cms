"use client";

import { useRouter } from "next/navigation";
import { TaskProofUpload } from "@/components/shared/TaskProofUpload";
import { DocumentViewLink } from "@/components/shared/DocumentViewLink";
import { deleteTaskProof } from "@/lib/taskProofs/actions";
import { markDeliveryProofUploaded } from "@/lib/driver/actions";
import { PROOF_TYPE_LABEL } from "@/lib/taskProofs/constants";

type Proof = {
  id: string;
  proof_type: string;
  remarks: string | null;
  created_at: string;
  documents: { id: string; original_filename: string } | null;
};

export function DeliveryProofSection({ companyId, deliveryId, proofs }: { companyId: string; deliveryId: string; proofs: Proof[] }) {
  const router = useRouter();

  async function handleUploaded() {
    await markDeliveryProofUploaded(deliveryId);
    router.refresh();
  }

  async function handleDelete(proofId: string) {
    await deleteTaskProof(proofId, { companyId, relatedTable: "deliveries", relatedId: deliveryId, revalidatePaths: [`/driver-logistics/${deliveryId}`] });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {proofs.length > 0 && (
        <div className="flex flex-col gap-2">
          {proofs.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-border px-3.5 py-2.5 text-[13px]">
              <div>
                <div className="font-semibold text-text">{PROOF_TYPE_LABEL[p.proof_type] ?? p.proof_type}</div>
                <div className="text-[11.5px] text-text-muted">
                  {p.documents?.original_filename} · {new Date(p.created_at).toLocaleString("en-MY")}
                  {p.remarks ? ` · ${p.remarks}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {p.documents && <DocumentViewLink documentId={p.documents.id} />}
                <button onClick={() => handleDelete(p.id)} className="text-[12px] font-semibold text-danger hover:underline">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <TaskProofUpload companyId={companyId} relatedTable="deliveries" relatedId={deliveryId} onUploaded={handleUploaded} />
    </div>
  );
}
