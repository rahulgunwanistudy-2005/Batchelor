import { afterEach, expect, it, vi } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { createSecp256k1SigningSession } from '@category-labs/mera';
import { IdleSession } from './session';
afterEach(()=>vi.useRealTimers());
const account=privateKeyToAccount(`0x${'11'.repeat(32)}`);
it('ends signing after ten idle minutes and clears the visible account',async()=>{vi.useFakeTimers();const changed=vi.fn(),session=createSecp256k1SigningSession({privateKey:new Uint8Array(32).fill(17)}),idle=new IdleSession(changed);idle.start(session,account);vi.advanceTimersByTime(600_000);expect(changed).toHaveBeenLastCalledWith(null);expect(()=>idle.get()).toThrow('expired');await expect(session.signDigest(new Uint8Array(32))).rejects.toMatchObject({code:'SESSION_ENDED'});});
it('refreshes idle lifetime on use and terminates replaced sessions',()=>{vi.useFakeTimers();const end=vi.fn(),nextEnd=vi.fn(),idle=new IdleSession(()=>{});idle.start({end} as never,account);vi.advanceTimersByTime(500_000);idle.get();vi.advanceTimersByTime(500_000);expect(end).not.toHaveBeenCalled();idle.start({end:nextEnd} as never,account);expect(end).toHaveBeenCalledOnce();idle.end();expect(nextEnd).toHaveBeenCalledOnce();});
it('checks elapsed time even if a background timer was throttled',()=>{let now=0;const end=vi.fn(),idle=new IdleSession(()=>{},600_000,()=>now);idle.start({end} as never,account);now=600_001;expect(()=>idle.get()).toThrow('expired');expect(end).toHaveBeenCalledOnce();});
