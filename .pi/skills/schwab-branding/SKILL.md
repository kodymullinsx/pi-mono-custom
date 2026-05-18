---
name: schwab-branding
description: Apply Charles Schwab corporate brand colors to presentations and slide decks. Use this skill when the user mentions "Schwab Branding" or requests to apply corporate colors to presentations, PowerPoint files, or slide decks of any format (ppt, pptx, tsc, etc.). This skill transforms existing presentations by replacing colors with official brand colors while preserving images and handling fills/borders appropriately.
---

# Schwab Branding

Apply Charles Schwab's corporate color palette to presentations and slide decks.

## Official Color Palette

### Primary Color
Core brand color for main headers, primary calls-to-action, and key brand elements.

| Color Name | RGB Value | Hex |
|:-----------|:----------|:----|
| **Core Blue** | (0, 160, 223) | #00A0DF |

### Secondary Colors
For text, backgrounds, sub-headers, and neutral elements.

| Color Name | RGB Value | Hex |
|:-----------|:----------|:----|
| **Dark Gray** | (66, 85, 99) | #425563 |
| **Light Gray** | (152, 164, 174) | #98A4AE |
| **Steel Blue** | (107, 164, 184) | #6BA4B8 |
| **Black** | (0, 0, 0) | #000000 |
| **White** | (255, 255, 255) | #FFFFFF |

### Chart and Graph Colors
Reserved for data visualization to ensure contrast and readability.

| Color Name | RGB Value | Hex |
|:-----------|:----------|:----|
| **True Blue** | (68, 108, 169) | #446CA9 |
| **Capri Blue** | (78, 193, 224) | #4EC1E0 |
| **Leaf Green** | (122, 156, 73) | #7A9C49 |
| **Olive** | (157, 174, 136) | #9DAE88 |
| **Orange** | (247, 168, 0) | #F7A800 |
| **Cayenne** | (200, 108, 97) | #C86C61 |
| **Pale Blue** | (187, 221, 230) | #BBDDE6 |
| **Purple** | (158, 71, 119) | #9E4777 |

## Color Application Workflow

### Step 1: Analyze the Presentation

First, examine the presentation to understand its structure:
- Identify slide master/theme colors
- Locate charts, graphs, and data visualizations
- Note text elements (headers, body text, callouts)
- Identify shape fills, borders, and backgrounds
- Preserve images and photos (do not recolor)

### Step 2: Apply Color Mapping

Replace existing colors with brand colors according to these guidelines:

**Headers and Titles:**
- Map to **Core Blue** (0, 160, 223) for primary emphasis
- Use **Dark Gray** (66, 85, 99) for secondary headers

**Body Text:**
- Map to **Dark Gray** (66, 85, 99) for primary text
- Use **Light Gray** (152, 164, 174) for secondary or descriptive text
- Use **Black** (0, 0, 0) for high-contrast situations

**Backgrounds:**
- Map to **White** (255, 255, 255) for primary backgrounds
- Use **Light Gray** (152, 164, 174) for subtle differentiation
- Use **Steel Blue** (107, 164, 184) for accent backgrounds

**Charts and Graphs:**
- Replace chart colors with the chart/graph palette in order:
  1. True Blue (68, 108, 169)
  2. Capri Blue (78, 193, 224)
  3. Leaf Green (122, 156, 73)
  4. Orange (247, 168, 0)
  5. Cayenne (200, 108, 97)
  6. Olive (157, 174, 136)
  7. Pale Blue (187, 221, 230)
  8. Purple (158, 71, 119)
- Use contrasting colors for adjacent data series

**Shape Fills and Borders:**
- Evaluate case-by-case based on the homogeneity of the presentation
- For consistent accent elements, map to **Core Blue** or **Steel Blue**
- For borders, use **Dark Gray** or **Light Gray** for subtle definition
- Preserve shapes with image fills

### Step 3: Implement the Changes

Use the appropriate tool (pptx skill or similar) to:
1. Replace theme/master colors first (affects entire deck)
2. Update individual slide elements as needed
3. Recolor charts and graphs with the designated palette
4. Adjust text colors for readability
5. Handle fills and borders based on context

### Step 4: Verify and Refine

After applying colors:
- Check for sufficient contrast (especially text on backgrounds)
- Ensure data visualizations remain readable
- Verify that the overall presentation maintains visual hierarchy
- Confirm images remain unchanged

## Special Considerations

**Images and Photos:**
- Never recolor embedded images or photographs
- Preserve original image content

**Fills and Borders:**
- Assess homogeneity of the presentation
- If elements are consistent throughout, apply brand colors uniformly
- If elements vary significantly, handle individually based on context

**Typography and Layout:**
- Do not modify fonts, sizing, or layout structure
- Focus exclusively on color replacement

**Color Matching:**
- When replacing colors, select the closest brand color by visual similarity
- Consider the element's purpose (data vs. decoration vs. text) when choosing replacements
