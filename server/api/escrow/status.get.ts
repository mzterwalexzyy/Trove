import { getEscrowAddress } from '../../utils/escrow'
import { lunaToNim, nimiqRpc } from '../../utils/nimiq'

/**
 * Public escrow health. The address is derived from the private key, so there
 * is no configured copy that could drift out of sync with it.
 */
export default defineEventHandler(async () => {
  const config = useRuntimeConfig()
  const address = await getEscrowAddress()

  const [account, height] = await Promise.all([
    nimiqRpc<{ balance: number, type: string }>('getAccountByAddress', [address]),
    nimiqRpc<number>('getBlockNumber'),
  ])

  return {
    address,
    balanceLuna: account.balance,
    balanceNim: lunaToNim(account.balance),
    network: config.public.nimiqNetwork,
    blockHeight: height,
  }
})
