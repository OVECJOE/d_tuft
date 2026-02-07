# INVALID OPCODES FOUND DURING STRESS TESTING AGAINST LIVE SMART CONTRACTS

I have found a few *"INVALID"* opcodes so far:

> The word, **INVALID**, in this context, refer to unknown. There are three possibilities here: *truly invalid*, custom opcode extending the EVM's supported, and function signature assumed (maybe).


## 0x22

I have seen this appear in a number of smart contracts like *LISK* (erc20), *Uniswap v2 Router*, and *MEGALODON* (erc20) to make me believe that there is more to this opcode.

Maybe I am missing something...

## 0x4d, 0x4e, 0x4f

This I saw mostly in *LISK* repeatedly. *Could Lisk have extended the EVM implementation with custom set of opcodes?*
