# rvol-breakout -- ThinkScript study (the .ts extension is for the VS Code plugin).
# Paste this entire file into Studies > Edit Studies > Create in thinkorswim.
# Remove the existing Volume study and add this lower study.
# Enable Show Extended-Hours Trading in chart settings; a study cannot enable it.
# Use time-based charts. Tick/range charts do not have comparable clock-time bars.
# RVOL is a multiple: 1.0 = average volume, 2.0 = twice average volume.
# Intraday: compare each bar with the same Eastern clock-time bar in the preceding
# lookbackSessions trading dates. Missing clock-time bars are omitted, not zeros.
# Daily label (latest bar only): cumulative volume through the current bar / historical cumulative
# volume through the matching bar. GetYYYYMMDD defines the trading session date
# (overnight futures sessions may begin on the preceding calendar day).
# Live bars compare partial current volume with FULL historical matching bars.
# No elapsed-bar extrapolation is applied. Updates follow incoming chart quotes.
# Calculates throughout loaded history, with a bounded 1,800-bar comparison window.
# lookbackSessions is a maximum session age, NOT a guaranteed sample count.
# Five-minute extended-hours charts may have fewer than 20 comparison sessions.
# Actual sample count is shown in the pane. No future sessions are used.
# The first loaded session is excluded because it may be incomplete.
# Shortened sessions without a matching bar are omitted.
# Daily and larger charts use prior chart-period volume averages instead of time
# matching. A daily RVOL label is unavailable on weekly/monthly charts.
# Hover/crosshair: enable the native Data Box and leave RVOL plot values enabled.
# AddLabel reads the latest bar; ThinkScript does not expose the hovered bar.
# Today and Curr refer to the latest loaded session/bar even when the market is closed.

declare lower;

input lookbackSessions = 20;
input minimumSamples = 1;
# No nested dynamic historical references. Leave room under the 2,000-bar limit.
def scanBarLimit = 1800;
input highRvolThreshold = 2.0;
input showDailyLabel = yes;
input showCurrentLabel = yes;

Assert(lookbackSessions >= 1 and lookbackSessions <= 20,
       "lookbackSessions must be between 1 and 20");
Assert(minimumSamples >= 1 and minimumSamples <= lookbackSessions,
       "minimumSamples must be between 1 and lookbackSessions");
Assert(highRvolThreshold >= 1, "highRvolThreshold must be at least 1");

def aggregation = GetAggregationPeriod();
def intraday = aggregation < AggregationPeriod.DAY;
def validBar = !IsNaN(close) and !IsNaN(volume);
def sessionDate = GetYYYYMMDD();
def newSession = BarNumber() == 1 or sessionDate != sessionDate[1];
def sessionNumber = CompoundValue(1,
    if validBar and newSession then sessionNumber[1] + 1
    else sessionNumber[1], 1);
def clockSeconds = SecondsFromTime(0000);
def cumulativeVolume = CompoundValue(1,
    if !validBar then cumulativeVolume[1]
    else if newSession then volume
    else cumulativeVolume[1] + volume, volume);

# A 24-hour upper bound avoids assumptions about fixed bars per trading day.
# Stop scanning once the requested session window has been passed.
def scanDepth = if intraday then
    Min(scanBarLimit, Ceil(AggregationPeriod.DAY / aggregation) * (lookbackSessions + 2))
    else 1;
def eligible = validBar and sessionNumber > 1;

def sampleCount = fold c = 1 to scanDepth + 1 with count = 0
    while c < BarNumber() and !IsNaN(GetValue(close, c, 1800)) and
          GetValue(sessionNumber, c, 1800) >= sessionNumber - lookbackSessions
    do count + (if GetValue(eligible, c, 1800) and
        GetValue(sessionNumber, c, 1800) < sessionNumber and
        GetValue(clockSeconds, c, 1800) == clockSeconds then 1 else 0);

def historicalBarSum = fold b = 1 to scanDepth + 1 with barSum = 0
    while b < BarNumber() and !IsNaN(GetValue(close, b, 1800)) and
          GetValue(sessionNumber, b, 1800) >= sessionNumber - lookbackSessions
    do barSum + (if GetValue(eligible, b, 1800) and
        GetValue(sessionNumber, b, 1800) < sessionNumber and
        GetValue(clockSeconds, b, 1800) == clockSeconds
        then GetValue(volume, b, 1800) else 0);

# Today is label-only: skip its scan on every historical candle.
# The next-bar NaN check identifies the last real candle; it supplies no volume
# or price to historical RVOL calculations. Skip entirely when Today is hidden.
def calculateTodayBaseline = showDailyLabel and intraday and validBar and IsNaN(close[-1]);
def historicalDaySum = fold d = 1 to scanDepth + 1 with daySum = 0
    while calculateTodayBaseline and d < BarNumber() and !IsNaN(GetValue(close, d, 1800)) and
          GetValue(sessionNumber, d, 1800) >= sessionNumber - lookbackSessions
    do daySum + (if GetValue(eligible, d, 1800) and
        GetValue(sessionNumber, d, 1800) < sessionNumber and
        GetValue(clockSeconds, d, 1800) == clockSeconds
        then GetValue(cumulativeVolume, d, 1800) else 0);

def averageBarVolume = if intraday then
    (if sampleCount >= minimumSamples then historicalBarSum / sampleCount else Double.NaN)
    else Average(volume[1], lookbackSessions);
def averageDayVolume = if sampleCount >= minimumSamples
    then historicalDaySum / sampleCount else Double.NaN;
def todayRvol = if intraday then
    (if averageDayVolume > 0 then cumulativeVolume / averageDayVolume else Double.NaN)
    else if aggregation == AggregationPeriod.DAY and averageBarVolume > 0
    then volume / averageBarVolume else Double.NaN;

plot RVOL = if validBar and averageBarVolume > 0
    then volume / averageBarVolume else Double.NaN;
RVOL.SetPaintingStrategy(PaintingStrategy.HISTOGRAM);
RVOL.SetLineWeight(3);
RVOL.AssignValueColor(if RVOL >= highRvolThreshold then Color.GREEN
    else if RVOL >= 1 then Color.CYAN else Color.GRAY);

plot AverageLevel = if validBar then 1 else Double.NaN;
AverageLevel.SetDefaultColor(Color.DARK_GRAY);
AverageLevel.SetStyle(Curve.SHORT_DASH);
AverageLevel.HideTitle();
AverageLevel.HideBubble();

AddLabel(showDailyLabel,
    "Today: " + (if IsNaN(todayRvol) then "N/A" else AsText(Round(todayRvol, 2)) + "x"),
    if IsNaN(todayRvol) then Color.GRAY
    else if todayRvol >= highRvolThreshold then Color.GREEN else Color.LIGHT_GRAY,
    location = Location.TOP_RIGHT, size = FontSize.SMALL);

# Keep the session label before the current-bar label.
AddLabel(showCurrentLabel,
    "Curr: " + (if IsNaN(RVOL) then "N/A" else AsText(Round(RVOL, 2)) + "x"),
    if IsNaN(RVOL) then Color.GRAY
    else if RVOL >= highRvolThreshold then Color.GREEN else Color.LIGHT_GRAY,
    location = Location.TOP_RIGHT, size = FontSize.SMALL);

AddLabel(intraday and validBar and sampleCount < minimumSamples,
    "Insufficient same-time history: " + sampleCount + "/" + minimumSamples,
    Color.YELLOW, location = Location.TOP_LEFT, size = FontSize.SMALL);
AddLabel(aggregation > AggregationPeriod.DAY,
    "Period RVOL; daily RVOL requires an intraday or daily chart",
    Color.GRAY, location = Location.TOP_LEFT, size = FontSize.SMALL);

AddLabel(intraday and validBar and sampleCount >= minimumSamples,
    "Baseline: " + sampleCount + " same-time sessions (max " + lookbackSessions +
    "; 1800-bar window)",
    if sampleCount < lookbackSessions then Color.YELLOW else Color.GRAY,
    location = Location.TOP_LEFT, size = FontSize.SMALL);
