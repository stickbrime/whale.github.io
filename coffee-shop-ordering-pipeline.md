# Coffee Shop Ordering System — Pipeline Graph

```mermaid
flowchart TD
    START([Customer arrives]) --> A[Enter app / visit store]

    %% ── ACCOUNT / AUTH ──────────────────────────────────────────
    A --> A1{Has account?}
    A1 -- No, skip --> B[Browse menu]
    A1 -- Yes, sign in --> A2[Authenticate \nSEIUE / email]
    A2 --> A3{Valid session?}
    A3 -- No --> A4[Login failed]
    A4 --> A5{Customer action}
    A5 -- Retry --> A2
    A5 -- Continue as guest --> B
    A3 -- Yes --> A6[Load profile + \nloyalty points + \ncredit status]
    A6 --> A7{Credit overdue?}
    A7 -- Yes --> A8[Show locked account banner]
    A8 --> A9{Customer action}
    A9 -- Settle overdue tab --> A10[Process settlement]
    A10 --> A6
    A9 -- View only mode --> B
    A7 -- No --> B

    %% ── BROWSE / MENU ────────────────────────────────────────────
    B --> B1[Browse menu \nfilter by category / search / sort]
    B1 --> C{Item selected?}
    C -- No, continue browsing --> B1
    C -- Yes --> C1{Item in stock?}
    C1 -- No --> C2[Show "Sold out"]
    C2 --> C3{Customer action}
    C3 -- Browse alternatives --> B1
    C3 -- Set back-in-stock alert --> C4([Notification scheduled])
    C3 -- Leave store --> EXIT1([Exit])

    C1 -- Yes --> D[Add item to cart \nwith quantity + \noptional customization]

    %% ── CART ─────────────────────────────────────────────────────
    D --> E{More items to add?}
    E -- Yes --> B1
    E -- No --> F[Review cart]

    F --> F1{Cart actions}
    F1 -- Edit quantity --> F2[Update quantity \nclamp to stock limit]
    F2 --> F
    F1 -- Edit customization --> F3[Update preferences]
    F3 --> F
    F1 -- Remove line item --> F
    F1 -- Clear entire cart --> F4{Customer confirm clear?}
    F4 -- Confirm --> F5[Cart emptied]
    F5 --> E
    F4 -- Cancel --> F
    F1 -- Apply loyalty points --> F6[Discount applied]
    F6 --> F
    F1 -- Proceed to checkout --> G[Begin checkout]
    F1 -- Save cart for later --> F7[Cart persisted \nlocalStorage]

    %% ── CHECKOUT ─────────────────────────────────────────────────
    G --> G1{Identity}
    G1 -- New customer --> G2[Enter name / email / phone]
    G2 --> G3[Account created \nat checkout]
    G1 -- Existing customer --> G4[Select saved profile]
    G4 --> G3

    G3 --> H[Select pickup time]
    H --> H1{Order type}
    H1 -- Takeaway --> H2[Set collection time]
    H1 -- Dine-in --> H3[Assign table / queue token]
    H1 -- Delivery --> H4[Enter delivery address]
    H4 --> H5{Address serviceable?}
    H5 -- No --> H6[Show unavailable area]
    H6 --> H7{Customer action}
    H7 -- Switch to pickup --> H2
    H7 -- Edit address --> H4
    H7 -- Cancel checkout --> CANCEL1([Order abandoned])

    H5 -- Yes --> I[Choose payment method]
    H2 --> I
    H3 --> I

    %% ── PAYMENT ──────────────────────────────────────────────────
    I --> P1{Payment method}
    P1 -- Card / Wallet --> P2[Process online payment]
    P1 -- Pay now (at pickup) --> P3[Order marked "paid" \nno capture]
    P1 -- Open a tab (赊账) --> P4[Credit tab selected]

    P4 --> P5[Choose tab duration \n1–14 days]
    P5 --> P6{Account authenticated?}
    P6 -- No --> P7[Login required \nfor credit tab]
    P7 --> P8{Customer action}
    P8 -- Sign in now --> A2
    P8 -- Choose other method --> I
    P6 -- Yes --> P9[Schedule credit due date]

    P1 -- Gift card --> GFT[Validate gift card]
    GFT --> GFT1{Gift card valid?}
    GFT1 -- No --> GFT2[Show invalid / insufficient]
    GFT2 --> GFT3{Customer action}
    GFT3 -- Retry different card --> GFT
    GFT3 -- Choose other method --> I
    GFT1 -- Yes --> P2

    P2 --> P10{Payment gateway success?}
    P10 -- No --> P11[Show failure reason \ninsufficient funds / \nnetwork error / declined]
    P11 --> P12{Customer action}
    P12 -- Retry same card --> P2
    P12 -- Use different card --> I
    P12 -- Switch to pay at counter --> P3
    P12 -- Cancel order --> PAYCANCEL([Order cancelled + \npayment not captured])

    P10 -- Yes --> J[Payment confirmed]
    P3 --> J
    P9 --> J

    %% ── ORDER CREATION ───────────────────────────────────────────
    J --> K[Create order ticket \nserver validates stock \n+ calculates total]
    K --> K1{Stock sufficient at commit?}
    K1 -- No ⟶ stock changed → K2[Reject order \nshow stock conflict]
    K2 --> K3{Customer action}
    K3 -- Review cart → F
    K3 -- Cancel → CANCEL2([Order cancelled])

    K1 -- Yes ⟶ K4[Deduct inventory + \npersist order]

    %% ── KITCHEN / FULFILLMENT ────────────────────────────────────
    K4 --> L[Order sent to \nbarista / kitchen queue]
    L --> L1{Store accepts order?}
    L1 -- No, overload / outage / system → L2[Order rejected]
    L2 --> L3{Resolution path}
    L3 -- Auto-refund if prepaid → L4[Initiate refund \npayment_status ⟶ refunded]
    L3 -- Offer substitute → L5{Customer accepts substitute?}
    L5 -- Yes → L5a[Modify items] --> L
    L5 -- No → L6[Cancel order + \nrefund if applicable]
    L4 --> L6

    L1 -- Yes → M[Prepare drinks / food]
    M --> M1{Prep issue during making?}
    M1 -- Yes, out of stock / spill → M2[Delay or \npartial outage]
    M2 --> M3{Customer notified \n+ decision}
    M3 -- Wait for remake → M
    M3 -- Accept alternative item → M
    M3 -- Cancel & refund → L6
    M1 -- No → N[Quality check + \npack + label]

    N --> O{Fulfillment mode}
    O -- Dine-in --> O1[Serve at table / \ncall token number]
    O -- Takeaway --> O2[Notify "ready for pickup" \npush / in-app alert]
    O -- Delivery --> O3[Assign rider + \ndispatch]

    O3 --> O4{Rider delivered?}
    O4 -- Yes → O5[Delivery confirmed]
    O4 -- No, failed / lost → O6[Attempt re-contact / \nredelivery]
    O6 --> O7{Resolution}
    O7 -- Delivered after retry → O5
    O7 -- Failed delivery → O8[Compensate / \nrefund policy]

    O1 --> X([Order completed])
    O2 --> X
    O5 --> X
    O8 --> X

    %% ── POST-ORDER ───────────────────────────────────────────────
    X --> POST{Post-order customer action}
    POST -- Rate product / store --> POST1[Submit review]
    POST -- Report issue → missing / wrong item --> POST2[Open support ticket]
    POST2 --> POST3{Resolution}
    POST3 -- Refund issued --> X
    POST3 -- Remake offered --> M
    POST -- Reorder all items as new cart --> B1
    POST -- Do nothing --> END([Exit])

    POST1 --> END
    POST -- View account activity / \nloyalty points --> ACT[Account page]
    ACT --> POST

    %% ── TAB / CREDIT EDGE CASES ──────────────────────────────────
    %% Overdue tab detection is handled at A7
    %% When returning to account after order:
    X -.-> CR{Was order a tab?}
    CR -- Yes --> CR1[Track due date \nlocalStorage + backend]
    CR1 --> CR2{Due date passed?}
    CR2 -- Yes --> CR3[Account becomes locked \non next visit → A7]
    CR2 -- No --> POST

    %% ── STYLES ────────────────────────────────────────────────────
    classDef START fill:#1a472a,color:#fff,stroke:#1a472a,stroke-width:2px
    classDef END fill:#2d2d2d,color:#fff,stroke:#2d2d2d,stroke-width:2px
    classDef CUST fill:#3b5998,color:#fff,stroke:#3b5998
    classDef SYS fill:#6b6b6b,color:#fff,stroke:#6b6b6b,stroke-dasharray:4 3
    classDef SUCCESS fill:#1a7a3a,color:#fff
    classDef FAIL fill:#a74e43,color:#fff
    classDef DIAMOND fill:#e8d9b4,stroke:#b3864b

    class START START
    class END,EXIT1,CANCEL1,PAYCANCEL,CANCEL2 END
    class A4,A8,C2,C1,K1,GFT1,C4 FAIL
    class J,K4,O1,O2,O5,X SUCCESS
    class C,C1,A1,A3,A7,A9,E,F1,F4,G1,H5,H7,I,P1,P6,P8,P10,P12,K1,K3,L1,L3,L5,M1,M3,O4,O6,O7,POST,CR,CR2 CUST
```

## Graph Structure Notes

| Layer | What it covers | Customer actions / branch points |
|-------|----------------|----------------------------------|
| **Auth** | Sign in, guest mode, credit lock check | Retry login, settle tab, continue as guest |
| **Browse** | Menu filtering, search, stock display | Continue browsing, set alert, leave |
| **Cart** | Add/edit/remove items, persist cart, loyalty | Edit qty, clear cart, apply points, save for later |
| **Checkout** | Identity (new/existing), pickup time, address | Switch order type, edit address, cancel |
| **Payment** | Card, pay-now, credit tab (1–14 days), gift card | Retry payment, switch method, sign in for credit |
| **Order creation** | Stock validation at commit, inventory deduction | Review cart, cancel |
| **Kitchen** | Accept/reject, substitution dialog | Accept substitute, wait, cancel & refund |
| **Fulfillment** | Dine-in, takeaway, delivery + retry | Wait for delivery retry, accept compensation |
| **Post-order** | Review, report issue, reorder, account view | Submit rating, open ticket, reorder, do nothing |
| **Credit lifecycle** | Tab due-date tracking, account locking on overdue | Settle overdue tab to unlock |
