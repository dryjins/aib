# Business Logic: Customer Retention Strategy

This module defines the decision logic for automated retention offers. It translates business intent (churn prevention) into executable rules based on customer segments and churn scores.

## 1. Pseudocode

The core logic is implemented as follows:

```javascript
/**
 * Decides which retention offer to present to a user based on churn risk and segment.
 * 
 * @param {string} user_id - The unique identifier of the user.
 * @returns {string} The offer code (e.g., "BIG_COUPON", "NO_OFFER").
 */
function decide_retention_offer(user_id) {
  // 1. Data Quality Check
  // Ensure we have valid data before making decisions (Hallucination prevention level 1)
  let is_valid = check_data_quality(user_id);
  
  if (is_valid == false) {
    return "NO_OFFER"; // Fail safe
  }

  // 2. Context Retrieval (Input)
  let segment = classify_segment(user_id); // e.g., "VIP", "STANDARD"
  let churn   = get_churn_score(user_id);  // Float 0.0 to 1.0

  // 3. Decision Logic (Business Rules)
  // Low Risk (< 0.4) -> Do nothing (save budget)
  if (churn < 0.4) {
    return "NO_OFFER";
  } 
  // Medium Risk (0.4 - 0.7) -> Nudge only VIPs
  else if (churn < 0.7) {
    if (segment == "VIP") {
      return "SMALL_COUPON";
    } else {
      return "NO_OFFER";
    }
  } 
  // High Risk (>= 0.7) -> Aggressive retention
  else {
    if (segment == "VIP") {
      return "BIG_COUPON";
    } else if (segment == "STANDARD") {
      return "MEDIUM_COUPON";
    } else {
      return "SMALL_COUPON";
    }
  }
}
```

## 2. Logic Flowchart

The following diagram visualizes the decision path:

```mermaid
flowchart TD
    Start([Start]) --> Q1{Is Data Valid?}
    
    Q1 -- No --> End1([Return: NO_OFFER])
    Q1 -- Yes --> GetInfo[Get Segment & Churn Score]
    
    GetInfo --> Q2{Churn Score < 0.4?}
    
    Q2 -- Yes (Low Risk) --> End2([Return: NO_OFFER])
    Q2 -- No --> Q3{Churn Score < 0.7?}
    
    Q3 -- Yes (Medium Risk) --> Q4{Is VIP?}
    Q4 -- Yes --> End3([Return: SMALL_COUPON])
    Q4 -- No --> End4([Return: NO_OFFER])
    
    Q3 -- No (High Risk) --> Q5{Segment Type?}
    Q5 -- VIP --> End5([Return: BIG_COUPON])
    Q5 -- Standard --> End6([Return: MEDIUM_COUPON])
    Q5 -- Other --> End7([Return: SMALL_COUPON])
    
    style Start fill:#f9f,stroke:#333,stroke-width:2px
    style End1 fill:#eee,stroke:#333
    style End5 fill:#bbf,stroke:#333,stroke-width:2px
```

## 3. Key Business Rules
| Condition | Segment | Offer | Rationale |
|-----------|---------|-------|-----------|
| **Churn < 0.4** | Any | None | Save budget on loyal users. |
| **Churn 0.4-0.7** | VIP | Small | Pre-emptive care for high-value users. |
| **Churn > 0.7** | VIP | Big | Critical intervention required. |

