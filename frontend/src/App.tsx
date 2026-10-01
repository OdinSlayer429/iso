import { useEffect, useState } from 'react'
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Address,
} from 'viem'
import './App.css'

const MONAD_TESTNET = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
  blockExplorers: { default: { name: 'Monadscan', url: 'https://testnet.monadscan.com' } },
} as const

const REGISTRY_ADDRESS: Address = '0xb06A8b7f9C922fD73745dB1980fd4ac85C98F33f'

const REGISTRY_ABI = [
  {
    type: 'function',
    name: 'certifyFairness',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_publicValues', type: 'bytes' },
      { name: '_proofBytes', type: 'bytes' },
    ],
    outputs: [
      { name: 'gapBps', type: 'uint32' },
      { name: 'thresholdBps', type: 'uint32' },
      { name: 'batchCommitment', type: 'bytes32' },
    ],
  },
  {
    type: 'function',
    name: 'attestationCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'attestations',
    stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
    outputs: [
      { name: 'lender', type: 'address' },
      { name: 'batchCommitment', type: 'bytes32' },
      { name: 'gapBps', type: 'uint32' },
      { name: 'thresholdBps', type: 'uint32' },
      { name: 'timestamp', type: 'uint256' },
    ],
  },
] as const

// Real values from an actual SP1 Groth16 proof generated over data/fair_batch.csv (500
// records). publicValues/proofBytes are the exact bytes SP1's prove().groth16() produced --
// not re-derived client-side, since any mismatch would fail real on-chain verification.
// No real proof exists yet for the biased batch (would need a separate proving run), so its
// certify action stays disabled rather than faking it.
const BATCHES = {
  fair: {
    label: 'Fair batch',
    description: '500 applicants, approval depends only on income/credit score',
    gapBps: 240,
    thresholdBps: 1000,
    passed: true,
    proof: {
      publicValues:
        '0x00000000000000000000000000000000000000000000000000000000000000f000000000000000000000000000000000000000000000000000000000000003e80000000000000000000000000000000000000000000000000000000000000001af867bb3331c61c2b836a62cc7721689ac8d68f6153c13e3c3474e79d851b7e6' as const,
      proofBytes:
        '0x4388a21c0000000000000000000000000000000000000000000000000000000000000000002f850ee998974d6cc00e50cd0814b098c05bfade466d28573240d057f2535200000000000000000000000000000000000000000000000000000000000000000e466992f6cd9323edae2b01e688681cb6a6774e355e8cd1b6a2683a84fe04951bf7c9bf02f79fe6ee5024eeb5540f7fcd0f047a5734f132eb42c146b200351303ce7fb97b6a8d9002c107c4e8d3e4fad4f669c683c7052508e0a9b595a8cd6410dd880c3467bfd6c4c6e0ab1106beea95bd510a10ba0c0e0e7b58f879d08a1d0b13d64e8bec492a0ddc0b356f259f5712f01e68c95d4ff7144b3cf8783659521753679ff358faf6944034a4ff24ffcedc9dbfa1d6dbc2c73e9982c2826796d914b09ad144a4f91cebc86d4e9935136c5a7046f9103565630b8f8675e1981ad80d2161a2f748cfb100bd70c958b69476f6e0171a51f9b4c0d6892b9a02aeac9c' as const,
    },
  },
  biased: {
    label: 'Biased batch',
    description: 'Same applicants, group B penalized regardless of qualification',
    gapBps: 4800,
    thresholdBps: 1000,
    passed: false,
    proof: null,
  },
} as const

type BatchKey = keyof typeof BATCHES
type Attestation = {
  lender: Address
  batchCommitment: `0x${string}`
  gapBps: number
  thresholdBps: number
  timestamp: bigint
}

const publicClient = createPublicClient({ chain: MONAD_TESTNET, transport: http() })

declare global {
  interface Window {
    ethereum?: any
  }
}

function App() {
  const [account, setAccount] = useState<Address | null>(null)
  const [selected, setSelected] = useState<BatchKey>('fair')
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'reverted' | 'error'>('idle')
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [attestations, setAttestations] = useState<Attestation[]>([])

  const batch = BATCHES[selected]

  async function loadAttestations() {
    const count = await publicClient.readContract({
      address: REGISTRY_ADDRESS,
      abi: REGISTRY_ABI,
      functionName: 'attestationCount',
    })
    const rows: Attestation[] = []
    for (let i = 0n; i < count; i++) {
      const [lender, batchCommitment, gapBps, thresholdBps, timestamp] = await publicClient.readContract({
        address: REGISTRY_ADDRESS,
        abi: REGISTRY_ABI,
        functionName: 'attestations',
        args: [i],
      })
      rows.push({ lender, batchCommitment, gapBps, thresholdBps, timestamp })
    }
    setAttestations(rows.reverse())
  }

  useEffect(() => {
    loadAttestations().catch(() => {})
  }, [])

  async function connect() {
    if (!window.ethereum) {
      setErrorMsg('No wallet found. Install MetaMask or another EIP-1193 wallet.')
      return
    }
    const [addr] = await window.ethereum.request({ method: 'eth_requestAccounts' })
    setAccount(addr as Address)
  }

  async function certify() {
    if (!account) {
      await connect()
      return
    }
    if (!batch.proof) {
      setStatus('error')
      setErrorMsg('No real proof has been generated for this batch yet.')
      return
    }
    setStatus('pending')
    setErrorMsg(null)
    setTxHash(null)
    try {
      const walletClient = createWalletClient({ chain: MONAD_TESTNET, transport: custom(window.ethereum) })

      const hash = await walletClient.writeContract({
        account,
        address: REGISTRY_ADDRESS,
        abi: REGISTRY_ABI,
        functionName: 'certifyFairness',
        args: [batch.proof.publicValues, batch.proof.proofBytes],
        chain: MONAD_TESTNET,
      })
      setTxHash(hash)

      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status === 'success') {
        setStatus('success')
        loadAttestations().catch(() => {})
      } else {
        setStatus('reverted')
      }
    } catch (err: any) {
      setStatus('error')
      setErrorMsg(err?.shortMessage ?? err?.message ?? String(err))
    }
  }

  return (
    <div className="page">
      <header>
        <h1>Iso</h1>
        <p className="subtitle">Zero-knowledge proof of fair lending -- without revealing the model or the data.</p>
        <div className="wallet-row">
          {account ? (
            <span className="pill">{account.slice(0, 6)}...{account.slice(-4)}</span>
          ) : (
            <button onClick={connect}>Connect wallet</button>
          )}
        </div>
      </header>

      <main>
        <section className="card">
          <h2>1. Pick a batch</h2>
          <div className="batch-toggle">
            {(Object.keys(BATCHES) as BatchKey[]).map((key) => (
              <button
                key={key}
                className={selected === key ? 'toggle active' : 'toggle'}
                onClick={() => {
                  setSelected(key)
                  setStatus('idle')
                  setTxHash(null)
                  setErrorMsg(null)
                }}
              >
                {BATCHES[key].label}
              </button>
            ))}
          </div>
          <p className="batch-description">{batch.description}</p>
          <div className="stats-row">
            <div className="stat">
              <span className="stat-label">Demographic parity gap</span>
              <span className="stat-value">{(batch.gapBps / 100).toFixed(1)}%</span>
            </div>
            <div className="stat">
              <span className="stat-label">Threshold</span>
              <span className="stat-value">{(batch.thresholdBps / 100).toFixed(1)}%</span>
            </div>
            <div className={batch.passed ? 'stat pass' : 'stat fail'}>
              <span className="stat-label">Result</span>
              <span className="stat-value">{batch.passed ? 'PASS' : 'FAIL'}</span>
            </div>
          </div>
        </section>

        <section className="card">
          <h2>2. Certify on-chain</h2>
          <p className="note">
            {batch.proof
              ? 'Submits a real SP1 Groth16 zero-knowledge proof to a real on-chain verifier -- no mock involved. This is the actual proof generated over the batch above.'
              : 'No real proof has been generated for this batch yet (would need a separate proving run) -- certification is disabled rather than faking it.'}
          </p>
          <button
            className="certify-button"
            onClick={certify}
            disabled={status === 'pending' || !batch.proof}
          >
            {!batch.proof ? 'No proof available' : account ? 'Certify fairness' : 'Connect wallet to certify'}
          </button>

          {status === 'pending' && <p className="status pending">Submitting transaction...</p>}
          {status === 'success' && (
            <p className="status success">
              Certified! {txHash && (
                <a href={`${MONAD_TESTNET.blockExplorers.default.url}/tx/${txHash}`} target="_blank" rel="noreferrer">
                  View on Monadscan
                </a>
              )}
            </p>
          )}
          {status === 'reverted' && <p className="status fail">Transaction reverted.</p>}
          {status === 'error' && <p className="status fail">{errorMsg}</p>}
        </section>

        <section className="card">
          <h2>Attestations recorded</h2>
          {attestations.length === 0 ? (
            <p className="note">No attestations yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Lender</th>
                  <th>Gap</th>
                  <th>Threshold</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {attestations.map((a, i) => (
                  <tr key={i}>
                    <td>{a.lender.slice(0, 6)}...{a.lender.slice(-4)}</td>
                    <td>{(a.gapBps / 100).toFixed(1)}%</td>
                    <td>{(a.thresholdBps / 100).toFixed(1)}%</td>
                    <td>{new Date(Number(a.timestamp) * 1000).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
