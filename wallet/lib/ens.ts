import { JustaName, type ChainId } from "@justaname.id/sdk";
import { sepolia } from "viem/chains";

const CLOAK_DOMAIN = "cloak.eth";
const CHAIN_ID = sepolia.id as ChainId;
const API_KEY = process.env.NEXT_PUBLIC_JAW_API_KEY!;

let justaName: JustaName | null = null;

function getJustaName() {
  if (!justaName) {
    justaName = JustaName.init({
      networks: [{ chainId: CHAIN_ID, providerUrl: "https://sepolia.drpc.org" }],
      ensDomains: [{ ensDomain: CLOAK_DOMAIN, chainId: CHAIN_ID }],
    });
  }
  return justaName;
}

export async function claimSubname(username: string, address: string) {
  const jn = getJustaName();
  await jn.subnames.addSubname({
    username,
    ensDomain: CLOAK_DOMAIN,
    chainId: CHAIN_ID,
    addresses: {
      "60": address,         // ETH
      "2147525809": address, // Base
    },
    apiKey: API_KEY,
    overrideSignatureCheck: true,
  });
  return `${username}.${CLOAK_DOMAIN}`;
}

export async function resolveEnsName(name: string): Promise<string | null> {
  try {
    const jn = getJustaName();
    // If user just typed "alice", expand to "alice.cloak.eth"
    const fullName = name.includes(".") ? name : `${name}.${CLOAK_DOMAIN}`;
    const result = await jn.subnames.getSubname({
      subname: fullName,
      chainId: CHAIN_ID,
    });
    const ethAddr = result?.records?.coins?.find((c: { id: number; value: string }) => c.id === 60)?.value;
    const baseAddr = result?.records?.coins?.find((c: { id: number; value: string }) => c.id === 2147525809)?.value;
    return baseAddr || ethAddr || null;
  } catch {
    return null;
  }
}

export async function isSubnameAvailable(username: string): Promise<boolean> {
  const jn = getJustaName();
  const result = await jn.subnames.isSubnameAvailable({
    subname: `${username}.${CLOAK_DOMAIN}`,
    chainId: CHAIN_ID,
  });
  return !!result;
}
