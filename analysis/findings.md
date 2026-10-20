# Findings: best lineup, best player, and a counter to a rebounding team

These answers come from the `/api/v1/lineups` endpoint and can be reproduced in the Lineup Explorer UI. Ratings are points per 100 possessions.

The data is a simulated six-team league (Gulls, Pumas, Ibex, Moose, Owls, Rams; 54 players, 30 games, 5,510 possessions). Players are named by team code and jersey number. Every player has a hidden offensive, defensive and rebounding skill that the possessions were simulated from, so for once the "true" answer is known and the methods can be checked against it.

League averages: 121.0 ORtg, 57.1% eFG%, 15.2% TOV%, 28.0% OREB% and 72.0% DREB%.

## 1. Which 5-man lineup has the most positive on-court impact?

**Owls: OWL #23, OWL #63, OWL #92, OWL #77 and OWL #04.**

I measured on-court impact as scoring margin while the five are on the floor, two ways: total margin (plus-minus) and margin per possession (net rating = ORtg − DRtg). A lineup that leads on only one of these is either piling up minutes without being efficient, or is efficient over too few possessions to move the scoreboard.

- **Best plus-minus in the league.** Of 275 five-man lineups, this group has the largest margin: +39 over 112 possessions in 5 games. It scored 90 points on 56 offensive possessions and allowed 51 on 56 defensive possessions. The next best margin is +33.
- **Second-best net rating of any lineup with 80+ possessions:** +69.6 (160.7 ORtg, 91.1 DRtg). The one lineup ahead of it (+76.7) is the same group with OWL #03 in place of OWL #77, over fewer possessions (86) and a smaller margin (+33).
- **It won on both ends.** On offense it had a 67.5% eFG% and turned it over on only 5.4% of possessions. On defense it held opponents to a 47.1% eFG% and forced turnovers on 23.2% of possessions.
- **It beats the team's other units.** On/off, the Owls' net rating was 33.7 points per 100 better with this group than with any other Owls unit, and the Owls are already the league's best team (+38.0 net rating).

## 2. Which player has the most positive on-court impact?

**OWL #03 (Owls).**

I looked at player impact three ways. Each corrects a weakness of the one before.

- **Raw plus-minus: +168, 7th in the league.** Plus-minus is dominated by the Owls: the top five are all Owls starters (OWL #63 leads at +264), because they play the most possessions on the best team.
- **On/off: +21.6, 5th of 54 players with 100+ possessions.** The Owls were +51.9 per 100 with OWL #03 and +30.3 over the possessions without him. The players ahead of him on on/off (IBX #67 at +35.1, PUM #37 at +24.1) are on losing teams whose benches are very poor, which inflates the swing: the Ibex were −1.0 with IBX #67 and −36.1 without him.
- **Adjusted plus-minus: 1st.** To control for teammates and opponents, I fit a regularized adjusted plus-minus (RAPM) model: a ridge regression of points on each of the 5,510 possessions, with indicator variables for the five offensive and five defensive players and the penalty chosen by 10-fold cross-validation (λ = 800). OWL #03 ranks 1st at every penalty I tested (λ from 25 to 1,600), at +8.1 per 100 (+1.8 offense, +6.3 defense). His lineups shot a 64.4% eFG% and held opponents to 39.3%.

**Checked against the truth:** in the simulation OWL #03 has the 2nd-highest true impact of all 54 players. RAPM's estimates correlate 0.54 with the true values at the cross-validated penalty. That is far from perfect with this little data, but it is the only one of the three measures that gets the top of the list right.

## 3. A new team crashes the glass with multiple centers and big forwards. Which 5-man lineup is best suited to countering it, and why?

**Owls: OWL #23, OWL #63, OWL #80, OWL #77 and OWL #04.**

A glass-crashing team wins the possession battle. It extends its own possessions with offensive rebounds and ends yours with defensive rebounds. A counter lineup should therefore, in order of importance:

1. finish defensive possessions by securing the defensive rebound, which takes away their main weapon;
2. hold its own on the offensive glass, so its misses are not automatically one-and-done;
3. defend well enough that there are fewer misses to fight over.

I compared the 17 five-man lineups with at least 100 possessions, so each has a meaningful number of rebound chances on both ends. This lineup is 1st or 2nd on every one of those needs:

- **Defensive rebounding: 82.4% DREB% (28 of 34 opponent misses), 1st of 17**, against a league average of 72.0%.
- **Offensive rebounding: 37.5% OREB% (9 of 24)**, well above the league's 28.0%. Combined, it grabbed 63.8% of all available rebounds, also 1st of 17.
- **Defense: 92.2 DRtg (2nd of 17)** and a 38.2% opponent eFG%, so opponents had more misses than usual and rarely got a second try at them.
- **It scores too:** 139.2 ORtg and a +47.1 net rating (2nd of 17). Its 49% three-point attempt rate pulls opposing centers away from the basket.

**Checked against the truth:** this is where the simulation is humbling. Of the five players, only OWL #77 is in the league's top 10 for true rebounding skill, and OWL #23 is near the bottom. The lineup's rebounding numbers over 58 rebound chances are partly luck, and its real edge against a big team is its defense (three of the five are top-15 true defenders). With real data I would want more possessions, or a rebounding-specific adjusted model, before betting on rebounding numbers from a single lineup.
