# ETH Swing Trade Alert Bot — Bot specification

**Archetype:** custom

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

Telegram bot monitoring ETH price and technical indicators to send actionable 'Good buy'/'Good sell' swing trade alerts for individual traders with small capital (~20$). Provides clear signals with confidence scores, timeframe suggestions, and stop-loss recommendations based on EMA, RSI, MACD, and ATR indicators.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Individual cryptocurrency traders
- Beginners in swing trading

## Success criteria

- Send actionable ETH trade alerts with technical justification
- Store 90-day signal history with user acknowledgements
- Allow user to mute alerts temporarily and adjust notification preferences

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open main menu with onboarding and default strategy activation
- **/mute** (command, actor: user, command: /mute) — Temporarily disable alerts for 1h/4h/24h
- **/summary** (command, actor: user, command: /summary) — Request daily signal summary
- **Acknowledge signal** (button, actor: user, callback: signal:ack) — Mark signal as acted upon
  - inputs: signal_id
  - outputs: confirmation message

## Flows

### Onboarding
_Trigger:_ /start

1. Display welcome message
2. Explain default strategy
3. Activate default indicators
4. Show mute options

_Data touched:_ User

### Daily Summary
_Trigger:_ /summary

1. Fetch last 24h signals
2. Format summary with key metrics
3. Send digest message

_Data touched:_ Alert history

### Signal Generation
_Trigger:_ Market data update

1. Calculate indicator states
2. Check signal rules (EMA/RSI/MACD)
3. Generate alert if conditions met
4. Apply 24h deduplication

_Data touched:_ Market feed, Indicator state, Signal

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **User** _(retention: persistent)_ — Telegram user preferences and notification settings
  - fields: telegram_id, notification_settings, last_ack_time
- **Market feed** _(retention: persistent)_ — ETH price and OHLCV candle data
  - fields: timestamp, price, open, high, low, volume
- **Indicator state** _(retention: persistent)_ — Technical indicator values for ETH
  - fields: ema20, ema50, rsi, macd, atr, timeframe
- **Signal** _(retention: persistent)_ — Generated trade signal with metadata
  - fields: type, reason, timestamp, price, timeframe, confidence
- **Alert history** _(retention: persistent)_ — Sent signals and user acknowledgements
  - fields: signal_id, user_id, ack_time

## Integrations

- **Telegram** (required) — Bot API messaging
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Telegram chat notifications management
- Market data source configuration

## Notifications

- ETH trade alerts in Telegram DM
- Daily signal summary digest
- Signal acknowledgment confirmations

## Permissions & privacy

- Store user preferences and alert history
- Access market data for ETH
- Send notifications only to registered users

## Edge cases

- Market data unavailability during critical price movements
- User misses signal acknowledgment window
- Conflicting signals from multiple indicators

## Required tests

- Verify signal deduplication works across timeframes
- Test notification suppression during mute periods
- Validate daily summary accuracy with real market data

## Assumptions

- User prefers French language messages
- Default signal rules are sufficient for swing trading
- Telegram is primary communication channel
