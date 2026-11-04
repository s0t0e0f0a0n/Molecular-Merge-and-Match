type PubChemCidResponse = {
  IdentifierList?: {
    CID?: number[];
  };
};

type PubChemSynonymResponse = {
  InformationList?: {
    Information?: Array<{
      Synonym?: string[];
    }>;
  };
};

export async function findCasNumberByInchi(inchi: string): Promise<string | null> {
  const cidResponse = await fetch(
    'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/inchi/cids/JSON',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ inchi }),
    },
  );
  if (!cidResponse.ok) {
    throw new Error(`PubChem could not resolve the InChI (${cidResponse.status}).`);
  }
  const cidData = (await cidResponse.json()) as PubChemCidResponse;
  const cid = cidData.IdentifierList?.CID?.[0];
  if (!cid) return null;

  const synonymResponse = await fetch(
    `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/synonyms/JSON`,
  );
  if (!synonymResponse.ok) {
    throw new Error(`PubChem could not retrieve compound synonyms (${synonymResponse.status}).`);
  }
  const synonymData = (await synonymResponse.json()) as PubChemSynonymResponse;
  const synonyms = synonymData.InformationList?.Information?.[0]?.Synonym ?? [];
  const casNumber = synonyms.find(
    (synonym) => /^\d{2,7}-\d{2}-\d$/.test(synonym),
  );
  return casNumber ?? null;
}
